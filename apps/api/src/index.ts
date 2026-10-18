import Fastify from 'fastify';
import { v7 as uuidv7 } from 'uuid';

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

  // Health endpoint
  app.get('/health', async () => {
    return { status: 'ok' };
  });

  // Readiness endpoint
  app.get('/ready', async () => {
    return { status: 'ok' };
  });

  // Sample route for testing
  app.get('/api/v1/test', async (request) => {
    request.log.info({ msg: 'Test endpoint called' });
    return { message: 'Hello from Finance Intelligence Hub' };
  });

  return app;
}

export { buildApp, isValidCorrelationId };

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = buildApp();
  app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' }, (err) => {
    if (err) {
      app.log.error(err);
      process.exit(1);
    }
  });
}
