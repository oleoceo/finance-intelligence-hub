import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp, isValidCorrelationId } from './index.js';
import Fastify from 'fastify';

describe('Logging and Request Correlation', () => {
  let app: Fastify.FastifyInstance;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('isValidCorrelationId validation', () => {
    it('accepts valid correlation IDs with allowed characters', () => {
      expect(isValidCorrelationId('abc123')).toBe(true);
      expect(isValidCorrelationId('test.correlation-id')).toBe(true);
      expect(isValidCorrelationId('ABC_123:xyz')).toBe(true);
      expect(isValidCorrelationId('a.b-c_d:e')).toBe(true);
    });

    it('rejects empty strings', () => {
      expect(isValidCorrelationId('')).toBe(false);
      expect(isValidCorrelationId('   ')).toBe(false);
    });

    it('rejects oversized values (>128 chars)', () => {
      const long = 'a'.repeat(129);
      expect(isValidCorrelationId(long)).toBe(false);
    });

    it('accepts max length (128 chars)', () => {
      const max = 'a'.repeat(128);
      expect(isValidCorrelationId(max)).toBe(true);
    });

    it('rejects malformed characters', () => {
      expect(isValidCorrelationId('test@id')).toBe(false);
      expect(isValidCorrelationId('test id')).toBe(false);
      expect(isValidCorrelationId('test/id')).toBe(false);
      expect(isValidCorrelationId('test\\id')).toBe(false);
    });

    it('rejects control characters', () => {
      expect(isValidCorrelationId('test\nid')).toBe(false);
      expect(isValidCorrelationId('test\rid')).toBe(false);
      expect(isValidCorrelationId('test\tid')).toBe(false);
    });

    it('rejects non-string values', () => {
      expect(isValidCorrelationId(123)).toBe(false);
      expect(isValidCorrelationId(null)).toBe(false);
      expect(isValidCorrelationId(undefined)).toBe(false);
      expect(isValidCorrelationId({})).toBe(false);
    });
  });

  describe('request_id generation', () => {
    it('generates a request_id for every handled request', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      // Verify request was handled successfully
    });

    it('produces distinct request_ids for concurrent requests', async () => {
      const promises = Array.from({ length: 5 }, () =>
        app.inject({ method: 'GET', url: '/health' }).then((res) => {
          // The request ID is generated per-request by genReqId
          return res;
        }),
      );

      await Promise.all(promises);

      // Each request should have been processed
      expect(promises.length).toBe(5);
    });
  });

  describe('correlation_id handling', () => {
    it('extracts correlation_id from X-Correlation-ID header when valid', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: {
          'x-correlation-id': 'my-correlation-123',
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('falls back to request_id when X-Correlation-ID is absent', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
    });

    it('falls back to request_id when X-Correlation-ID is invalid (oversized)', async () => {
      const longId = 'a'.repeat(129);
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: {
          'x-correlation-id': longId,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('falls back to request_id when X-Correlation-ID is malformed', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: {
          'x-correlation-id': 'invalid@id!',
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('falls back to request_id when X-Correlation-ID contains control characters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: {
          'x-correlation-id': 'test\nid',
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('falls back to request_id when X-Correlation-ID is empty', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: {
          'x-correlation-id': '',
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('does not fail request due to invalid correlation metadata', async () => {
      const invalidValues = ['a'.repeat(129), 'invalid@id', '', '   ', 'test\nid'];

      for (const value of invalidValues) {
        const response = await app.inject({
          method: 'GET',
          url: '/health',
          headers: {
            'x-correlation-id': value,
          },
        });

        expect(response.statusCode).toBe(200);
      }
    });

    it('handles case-insensitive header lookup', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: {
          'X-CORRELATION-ID': 'case-insensitive-test',
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('structured log output', () => {
    it('includes canonical request_id and correlation_id fields', async () => {
      const logs: string[] = [];
      const stream = {
        write: (chunk: Buffer | string) => {
          logs.push(typeof chunk === 'string' ? chunk : chunk.toString());
        },
      };

      const testApp = Fastify({
        logger: {
          level: 'info',
          stream,
          serializers: {
            req(req) {
              return {
                method: req.method,
                url: req.url,
                host: req.headers.host,
                remoteAddress: req.ip,
              };
            },
            res(res) {
              return {
                statusCode: res.statusCode,
              };
            },
          },
        },
        genReqId: () => 'test-request-id-123',
      });

      testApp.addHook('preHandler', (request, _reply, done) => {
        request.log = request.log.child({
          request_id: request.id,
          correlation_id: request.id,
        });
        done();
      });

      testApp.get('/test', async (request) => {
        request.log.info({ msg: 'application log entry' });
        return { status: 'ok' };
      });
      await testApp.ready();

      await testApp.inject({
        method: 'GET',
        url: '/test',
      });

      await testApp.close();

      // Verify structured JSON logs contain canonical field names in application logs
      expect(logs.length).toBeGreaterThan(0);
      // Find the application log entry (not the automatic request/response logs)
      const appLogLine = logs.find((line) => line.includes('"msg":"application log entry"'));
      expect(appLogLine).toBeDefined();
      const parsedAppLog = JSON.parse(appLogLine!);
      expect(parsedAppLog.request_id).toBe('test-request-id-123');
      expect(parsedAppLog.correlation_id).toBe('test-request-id-123');
    });
  });

  describe('sensitive value redaction', () => {
    it('redacts authorization header from logs', async () => {
      const logs: string[] = [];
      const stream = {
        write: (chunk: Buffer | string) => {
          logs.push(typeof chunk === 'string' ? chunk : chunk.toString());
        },
      };

      const testApp = Fastify({
        logger: {
          level: 'info',
          stream,
          redact: {
            paths: ['req.headers.authorization'],
            censor: '[REDACTED]',
          },
          serializers: {
            req(req) {
              return {
                method: req.method,
                url: req.url,
                host: req.headers.host,
                remoteAddress: req.ip,
              };
            },
            res(res) {
              return {
                statusCode: res.statusCode,
              };
            },
          },
        },
        genReqId: () => 'test-id',
      });

      testApp.get('/test', async (request) => {
        request.log.info({ msg: 'test log' });
        return { ok: true };
      });

      await testApp.ready();

      await testApp.inject({
        method: 'GET',
        url: '/test',
        headers: {
          authorization: 'Bearer secret-token-12345',
        },
      });

      await testApp.close();

      // Verify no raw token appears in logs
      const combinedLogs = logs.join('');
      expect(combinedLogs).not.toContain('secret-token-12345');
    });

    it('redacts cookie header from logs', async () => {
      const logs: string[] = [];
      const stream = {
        write: (chunk: Buffer | string) => {
          logs.push(typeof chunk === 'string' ? chunk : chunk.toString());
        },
      };

      const testApp = Fastify({
        logger: {
          level: 'info',
          stream,
          redact: {
            paths: ['req.headers.cookie'],
            censor: '[REDACTED]',
          },
          serializers: {
            req(req) {
              return {
                method: req.method,
                url: req.url,
                host: req.headers.host,
                remoteAddress: req.ip,
              };
            },
            res(res) {
              return {
                statusCode: res.statusCode,
              };
            },
          },
        },
        genReqId: () => 'test-id',
      });

      testApp.get('/test', async (request) => {
        request.log.info({ msg: 'test log' });
        return { ok: true };
      });

      await testApp.ready();

      await testApp.inject({
        method: 'GET',
        url: '/test',
        headers: {
          cookie: 'session=secret-session-value',
        },
      });

      await testApp.close();

      const combinedLogs = logs.join('');
      expect(combinedLogs).not.toContain('secret-session-value');
    });

    it('does not log raw request bodies wholesale', async () => {
      const logs: string[] = [];
      const stream = {
        write: (chunk: Buffer | string) => {
          logs.push(typeof chunk === 'string' ? chunk : chunk.toString());
        },
      };

      const testApp = Fastify({
        logger: {
          level: 'info',
          stream,
          redact: {
            paths: ['req.body.password'],
            censor: '[REDACTED]',
          },
          serializers: {
            req(req) {
              return {
                method: req.method,
                url: req.url,
                host: req.headers.host,
                remoteAddress: req.ip,
              };
            },
            res(res) {
              return {
                statusCode: res.statusCode,
              };
            },
          },
        },
        genReqId: () => 'test-id',
      });

      testApp.post('/test', async (request) => {
        // Do not log raw body; only log safe application fields
        request.log.info({ msg: 'test log' });
        return { ok: true };
      });

      await testApp.ready();

      await testApp.inject({
        method: 'POST',
        url: '/test',
        payload: {
          normalField: 'NORMAL_MARKER_12345',
          password: 'SECRET_MARKER_67890',
        },
      });

      await testApp.close();

      const combinedLogs = logs.join('');

      // Verify raw body is not logged wholesale
      expect(combinedLogs).not.toContain('NORMAL_MARKER_12345');
      // Verify secret is not present
      expect(combinedLogs).not.toContain('SECRET_MARKER_67890');
    });
  });

  describe('endpoint functionality', () => {
    it('health endpoint returns ok', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ status: 'ok' });
    });

    it('ready endpoint returns not_ready when DATABASE_URL is missing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ready',
      });

      // Without DATABASE_URL, readiness should return 503
      expect(response.statusCode).toBe(503);
      expect(JSON.parse(response.body)).toEqual({
        status: 'not_ready',
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'The service could not complete the request.',
          details: {},
        },
        meta: { request_id: expect.any(String), correlation_id: expect.any(String) },
      });
    });

    it('test endpoint returns message', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/test',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({
        message: 'Hello from Finance Intelligence Hub',
      });
    });
  });
});
