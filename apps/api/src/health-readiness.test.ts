import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from './index.js';
import type Fastify from 'fastify';
import * as databaseModule from '@finance-hub/database';

// Mock the database module to control readiness behavior
vi.mock('@finance-hub/database', async () => {
  const actual = await vi.importActual('@finance-hub/database');
  return {
    ...actual,
    checkPostgreSQLReadiness: vi.fn(),
  };
});

describe('Health and Readiness Endpoints', () => {
  let app: Fastify.FastifyInstance;

  beforeEach(async () => {
    // Reset mocks before each test
    vi.clearAllMocks();
    app = buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('is independent of database configuration', async () => {
      const previous = process.env.DATABASE_URL;
      delete process.env.DATABASE_URL;
      try {
        const response = await app.inject({ method: 'GET', url: '/health' });
        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body)).toEqual({ status: 'ok' });
        expect(databaseModule.checkPostgreSQLReadiness).not.toHaveBeenCalled();
      } finally {
        if (previous === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = previous;
      }
    });
    it('returns 200 with status ok', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ status: 'ok' });
    });

    it('remains 200 when PostgreSQL readiness fails', async () => {
      // Mock readiness to fail
      vi.mocked(databaseModule.checkPostgreSQLReadiness).mockResolvedValue({ ready: false });

      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ status: 'ok' });
    });
  });

  describe('GET /ready', () => {
    it('does not log sensitive query strings or headers', async () => {
      const lines: string[] = [];
      const stream = {
        write: (chunk: string | Buffer) => {
          lines.push(String(chunk));
        },
      };
      const testApp = buildApp({ logStream: stream as NodeJS.WritableStream });
      const previous = process.env.DATABASE_URL;
      try {
        delete process.env.DATABASE_URL;
        const response = await testApp.inject({
          method: 'GET',
          url: '/ready?token=URL_SECRET_MARKER&csv=CSV_SECRET_MARKER',
          headers: {
            authorization: 'Bearer AUTH_SECRET_MARKER',
            cookie: 'session=COOKIE_SECRET_MARKER',
            'x-api-key': 'API_KEY_SECRET_MARKER',
          },
        });
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
      } finally {
        await testApp.close();
        if (previous === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = previous;
      }
      const output = lines.join('');
      expect(output).toContain('"url":"/ready"');
      for (const secret of [
        'URL_SECRET_MARKER',
        'CSV_SECRET_MARKER',
        'AUTH_SECRET_MARKER',
        'COOKIE_SECRET_MARKER',
        'API_KEY_SECRET_MARKER',
      ]) {
        expect(output).not.toContain(secret);
      }
    });

    it('uses request_id when correlation headers are absent, invalid or duplicated', async () => {
      const lines: string[] = [];
      const testApp = buildApp({
        logStream: {
          write: (chunk: string | Buffer) => {
            lines.push(String(chunk));
          },
        } as NodeJS.WritableStream,
      });
      const previous = process.env.DATABASE_URL;
      delete process.env.DATABASE_URL;
      try {
        for (const headers of [
          {},
          { 'x-correlation-id': 'invalid@id' },
          { 'x-correlation-id': ['first', 'second'] },
        ]) {
          const response = await testApp.inject({ method: 'GET', url: '/ready', headers });
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
        }
      } finally {
        await testApp.close();
        if (previous === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = previous;
      }
      const warnings = lines
        .map(
          (line) =>
            JSON.parse(line) as { level: number; request_id?: string; correlation_id?: string },
        )
        .filter((line) => line.level === 40);
      expect(warnings).toHaveLength(3);
      for (const warning of warnings) {
        expect(warning.request_id).toEqual(expect.any(String));
        expect(warning.correlation_id).toBe(warning.request_id);
      }
    });

    it('returns 200 with status ready when PostgreSQL is available', async () => {
      vi.mocked(databaseModule.checkPostgreSQLReadiness).mockResolvedValue({ ready: true });

      // Set DATABASE_URL for this test
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test';

      const response = await app.inject({
        method: 'GET',
        url: '/ready',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ status: 'ready' });

      // Clean up
      delete process.env.DATABASE_URL;
    });

    it('returns 503 with status not_ready when PostgreSQL is unavailable', async () => {
      vi.mocked(databaseModule.checkPostgreSQLReadiness).mockResolvedValue({ ready: false });

      // Set DATABASE_URL for this test
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test';

      const response = await app.inject({
        method: 'GET',
        url: '/ready',
      });

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

      // Clean up
      delete process.env.DATABASE_URL;
    });

    it('returns 503 with status not_ready when DATABASE_URL is not configured', async () => {
      // Ensure DATABASE_URL is not set
      delete process.env.DATABASE_URL;

      const response = await app.inject({
        method: 'GET',
        url: '/ready',
      });

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

    it('returns 503 with status not_ready when readiness check throws', async () => {
      vi.mocked(databaseModule.checkPostgreSQLReadiness).mockRejectedValue(
        new Error('Connection failed'),
      );

      // Set DATABASE_URL for this test
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test';

      const response = await app.inject({
        method: 'GET',
        url: '/ready',
      });

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

      // Clean up
      delete process.env.DATABASE_URL;
    });

    it('does not expose sensitive database details in error responses', async () => {
      vi.mocked(databaseModule.checkPostgreSQLReadiness).mockRejectedValue(
        new Error('connect ECONNREFUSED 192.168.1.100:5432 - password: secret123'),
      );

      // Set DATABASE_URL for this test
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test';

      const response = await app.inject({
        method: 'GET',
        url: '/ready',
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body).toEqual({
        status: 'not_ready',
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'The service could not complete the request.',
          details: {},
        },
        meta: { request_id: expect.any(String), correlation_id: expect.any(String) },
      });
      expect(body).not.toHaveProperty('details');
      expect(response.body).not.toContain('secret123');
      expect(response.body).not.toContain('192.168.1.100');
      expect(response.body).not.toContain('ECONNREFUSED');

      // Clean up
      delete process.env.DATABASE_URL;
    });

    it('process remains healthy after readiness failure', async () => {
      vi.mocked(databaseModule.checkPostgreSQLReadiness).mockResolvedValue({ ready: false });

      // Set DATABASE_URL for this test
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test';

      // First, readiness fails
      const readyResponse = await app.inject({
        method: 'GET',
        url: '/ready',
      });
      expect(readyResponse.statusCode).toBe(503);

      // Health should still work
      const healthResponse = await app.inject({
        method: 'GET',
        url: '/health',
      });
      expect(healthResponse.statusCode).toBe(200);
      expect(JSON.parse(healthResponse.body)).toEqual({ status: 'ok' });

      // Clean up
      delete process.env.DATABASE_URL;
    });

    it('preserves safe failure output and correlation metadata', async () => {
      vi.mocked(databaseModule.checkPostgreSQLReadiness).mockResolvedValue({ ready: false });
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test';
      const response = await app.inject({
        method: 'GET',
        url: '/ready',
        headers: { 'x-correlation-id': 'p05-check' },
      });
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
      expect(response.body).not.toContain('postgresql://');
      expect(JSON.parse(response.body).meta.correlation_id).toBe('p05-check');
      delete process.env.DATABASE_URL;
    });
  });
});
