import Fastify from 'fastify';
import { randomBytes } from 'node:crypto';
import { v7 as uuidv7 } from 'uuid';
import { checkPostgreSQLReadiness, createConfigurationStore } from '@finance-hub/database';
import type { ConfigurationOptions } from './routes/admin/shared.js';
import { adminAuthentication, ingestAuthentication, type Credentials } from './middleware/auth.js';
import { ApiError, installErrorHandler } from './middleware/errors.js';
import { registerBooks } from './routes/admin/books.js';
import { registerAccounts } from './routes/admin/accounts.js';
import { registerCategories } from './routes/admin/categories.js';
import { registerMerchants } from './routes/admin/merchants.js';
import { registerClassificationRules } from './routes/admin/classification-rules.js';
import { registerAuthorizedSenders } from './routes/admin/authorized-senders.js';
import {
  GenericCreateTransaction,
  normalizeName,
  type FinancialTransactionPort,
  type HumanRefGenerator,
  type TransactionReadPort,
  type InboxTransactionPort,
  type InboxProcessingPort,
  type ProcessMessageDependencies,
} from '@finance-hub/core';
import { strict } from './schemas/configuration.js';
import { registerTransactions, type TransactionRouteOptions } from './routes/transactions.js';
import { registerInbox } from './routes/inbox.js';

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

export interface AppOptions extends Credentials {
  transactions?: ConfigurationOptions['transactions'];
  financialTransactions?: FinancialTransactionPort;
  transactionReads?: TransactionReadPort;
  genericCreate?: TransactionRouteOptions['genericCreate'];
  inboxTransactions?: InboxTransactionPort;
  inboxProcessing?: InboxProcessingPort;
  humanRefGenerator?: HumanRefGenerator;
  now?: () => Date;
}
function buildApp(options: AppOptions = {}) {
  const app = Fastify({
    exposeHeadRoutes: false,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false, useDefaults: false } },
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

  installErrorHandler(app);
  const authenticate = adminAuthentication({
    adminToken: options.adminToken ?? process.env.FINANCE_ADMIN_TOKEN,
    ingestToken: options.ingestToken ?? process.env.FINANCE_INGEST_TOKEN,
  });
  const authenticateIngest = ingestAuthentication({
    adminToken: options.adminToken ?? process.env.FINANCE_ADMIN_TOKEN,
    ingestToken: options.ingestToken ?? process.env.FINANCE_INGEST_TOKEN,
  });
  const store =
    !options.transactions && process.env.DATABASE_URL
      ? createConfigurationStore(process.env.DATABASE_URL)
      : undefined;
  if (store) app.addHook('onClose', async () => store.close());
  const configuration: ConfigurationOptions = {
    transactions: options.transactions ??
      store?.transactions ?? {
        async runInTransaction() {
          throw new ApiError(503, 'DATABASE_UNAVAILABLE');
        },
      },
    now: options.now ?? (() => new Date()),
  };
  const unavailable = async (): Promise<never> => {
    throw new ApiError(503, 'DATABASE_UNAVAILABLE');
  };
  const transactionReads: TransactionReadPort = options.transactionReads ??
    store?.transactionReads ?? {
      findById: unavailable,
      list: unavailable,
      getLast: unavailable,
    };
  const genericCreate =
    options.genericCreate ??
    new GenericCreateTransaction(
      options.financialTransactions ??
        store?.financialTransactions ?? {
          runInTransaction: unavailable,
        },
      {
        humanRefGenerator: options.humanRefGenerator ?? {
          generate: () => randomBytes(8).toString('hex').toUpperCase(),
        },
        now: options.now ?? (() => new Date()),
      },
    );

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

  app.register(async (admin) => {
    admin.addHook('onRequest', authenticate);
    admin.addHook('onRoute', (route) => {
      route.schema = { ...route.schema, querystring: route.schema?.querystring ?? strict({}) };
    });
    admin.addHook('preValidation', async (request) => {
      const body = request.body as Record<string, unknown> | null;
      const schema = request.routeOptions.schema?.body as
        { properties?: Record<string, { maxLength?: number }> } | undefined;
      if (!body || typeof body !== 'object') return;
      const rawRouterPath =
        (request as unknown as { routerPath?: string }).routerPath ?? request.url ?? '';
      const isSenderRoute = rawRouterPath.includes('authorized-senders');
      // AuthorizedSender.name is raw VARCHAR(160) with no normalized_name; constrain only raw length.
      // Book/Account/Category/Merchant name: prove BOTH raw and normalized values fit storage limits.
      const nameValue = body['name'];
      if (typeof nameValue === 'string') {
        const limit = schema?.properties?.['name']?.maxLength as number | undefined;
        if (limit) {
          if (isSenderRoute) {
            if ([...nameValue].length > limit)
              throw new ApiError(422, 'VALIDATION_ERROR', 'invalid_request');
          } else {
            const rawLen = [...nameValue].length;
            const normLen = [...normalizeName(nameValue)].length;
            if (rawLen > limit || normLen > limit)
              throw new ApiError(422, 'VALIDATION_ERROR', 'invalid_request');
          }
        }
      }
      // ClassificationRule.pattern: prove raw and normalized pattern fit 500.
      const patternValue = body['pattern'];
      if (typeof patternValue === 'string') {
        const limit = schema?.properties?.['pattern']?.maxLength as number | undefined;
        if (limit && [...patternValue.trim().toLowerCase()].length > limit)
          throw new ApiError(422, 'VALIDATION_ERROR', 'invalid_request');
      }
    });
    registerBooks(admin, configuration);
    registerAccounts(admin, configuration);
    registerCategories(admin, configuration);
    registerMerchants(admin, configuration);
    registerClassificationRules(admin, configuration);
    registerAuthorizedSenders(admin, configuration);
    registerTransactions(admin, { genericCreate, transactionReads });
  });

  app.register(async (ingest) => {
    ingest.addHook('onRequest', authenticateIngest);
    const deps: ProcessMessageDependencies = {
      inboxTransactions: options.inboxTransactions ??
        store?.inboxTransactions ?? { runInTransaction: unavailable },
      processing: options.inboxProcessing ??
        store?.financialTransactions ?? { runInboxTransaction: unavailable },
      genericCreate:
        'executeInContext' in genericCreate
          ? (genericCreate as ProcessMessageDependencies['genericCreate'])
          : { executeInContext: unavailable },
      now: options.now ?? (() => new Date()),
    };
    registerInbox(ingest, deps);
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
