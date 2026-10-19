import Fastify from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { checkPostgreSQLReadiness } from '@finance-hub/database';

const ALLOWED_CORRELATION_CHARS = /^[A-Za-z0-9._:-]+$/;
const MAX_CORRELATION_LENGTH = 128;

function isValidCorrelationId(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_CORRELATION_LENGTH) return false;
  if (!ALLOWED_CORRELATION_CHARS.test(trimmed)) return false;
  // Reject control characters
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i);
    if (code < 32 || code === 127) return false;
  }
  return true;
}

function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-api-key"]',
          'req.headers["x-auth-token"]',
          'req.body.password',
          'req.body.secret',
          'req.body.token',
          'req.body.apiKey',
          'req.body.api_key',
          'req.body.databaseUrl',
          'req.body.connectionString',
          'res.headers["set-cookie"]',
        ],
        censor: '[REDACTED]',
      },
      // Custom serializers to rename Fastify internal fields to canonical names
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
    genReqId: () => uuidv7(),
    // Disable automatic request/response logging of body to prevent wholesale body logging
    disableRequestLogging: false,
  });

  // Add correlation ID extraction hook
  app.addHook('onRequest', (request, _reply, done) => {
    const rawCorrelationHeader = request.headers['x-correlation-id'];
    let correlationId: string;
    if (Array.isArray(rawCorrelationHeader)) {
      // Multiple values: treat as invalid, fall back to request_id
      correlationId = request.id;
    } else if (isValidCorrelationId(rawCorrelationHeader)) {
      correlationId = rawCorrelationHeader;
    } else {
      // Absent or invalid: fall back to request_id
      correlationId = request.id;
    }
    // Attach correlation_id to request context
    (request as unknown as { correlationId: string }).correlationId = correlationId;
    done();
  });

  // Override Pino bindings to inject canonical field names into request logs
  app.addHook('preHandler', (request, _reply, done) => {
    const correlationId = (request as unknown as { correlationId: string }).correlationId;
    // Use child logger with canonical field names
    request.log = request.log.child({
      request_id: request.id,
      correlation_id: correlationId,
    });
    done();
  });

  // Health endpoint - independent of external dependencies
  app.get('/health', async () => {
    return { status: 'ok' };
  });

  // Readiness endpoint - performs bounded PostgreSQL check
  app.get('/ready', async (request, reply) => {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      request.log.warn({ msg: 'DATABASE_URL not configured for readiness check' });
      return reply.code(503).send({ status: 'not_ready' });
    }

    try {
      const result = await checkPostgreSQLReadiness({
        connectionString,
        timeoutMs: 2000,
      });

      if (result.ready) {
        return { status: 'ready' };
      } else {
        request.log.warn({ msg: 'PostgreSQL readiness check failed' });
        return reply.code(503).send({ status: 'not_ready' });
      }
    } catch {
      // Never expose raw errors; log safely and return not_ready
      request.log.error({ msg: 'PostgreSQL readiness check encountered an error' });
      return reply.code(503).send({ status: 'not_ready' });
    }
  });

  // Sample route for testing
  app.get('/api/v1/test', async (request) => {
    request.log.info({ msg: 'Test endpoint called' });
    return { message: 'Hello from Finance Intelligence Hub' };
  });

  return app;
}

export { buildApp, isValidCorrelationId };

// Production bootstrap: only runs when this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';

  const app = buildApp();

  let server: Awaited<ReturnType<typeof app.listen>> | null = null;

  // Graceful shutdown handler
  async function gracefulShutdown(signal: string) {
    app.log.info({ msg: `Received ${signal}, starting graceful shutdown` });

    // Stop accepting new connections
    if (server) {
      try {
        await app.close();
        app.log.info({ msg: 'Fastify server closed successfully' });
      } catch (err) {
        app.log.error({ err, msg: 'Error during Fastify close' });
        process.exit(1);
      }
    }

    process.exit(0);
  }

  // Register signal handlers
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Start listening
  app.listen({ port, host }, (err, address) => {
    if (err) {
      app.log.error({ err, msg: 'Failed to start server' });
      process.exit(1);
    }
    server = address as unknown as typeof server;
    app.log.info({ msg: `Server listening on ${address}` });
  });
}
