import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { checkPostgreSQLReadiness } from '@finance-hub/database';
import { buildApp } from '../../apps/api/src/index.js';
import { createConnection, createServer } from 'node:net';
import { Client } from 'pg';

describe('PostgreSQL Readiness Integration (Testcontainers)', { timeout: 120000 }, () => {
  let container: StartedTestContainer;
  let connectionString: string;

  beforeAll(async () => {
    // Start ephemeral PostgreSQL 18.6 container
    container = await new GenericContainer('postgres:18.6-bookworm')
      .withEnvironment({
        POSTGRES_DB: 'readiness_test_db',
        POSTGRES_USER: 'readiness_user',
        POSTGRES_PASSWORD: 'readiness_password',
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections', 1))
      .withStartupTimeout(120000)
      .start();

    const port = container.getMappedPort(5432);
    const host = container.getHost();

    // Wait for port binding to stabilize in WSL2
    await new Promise((resolve) => setTimeout(resolve, 3000));

    connectionString = `postgresql://readiness_user:readiness_password@${host}:${port}/readiness_test_db`;
  });

  afterAll(async () => {
    if (container) {
      await container.stop();
    }
  });

  it('should pass readiness check against real PostgreSQL 18.6', async () => {
    const result = await checkPostgreSQLReadiness({
      connectionString,
      timeoutMs: 2000,
    });

    expect(result.ready).toBe(true);
  });

  it('serves /ready against real PostgreSQL and closes the probe connection', async () => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = connectionString;
    const app = buildApp();
    const observer = new Client({ connectionString });
    try {
      await observer.connect();
      const before = await observer.query<{ count: string }>(
        "select count(*) from pg_stat_activity where datname = current_database() and application_name = ''",
      );
      const response = await app.inject({ method: 'GET', url: '/ready' });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ status: 'ready' });
      const after = await observer.query<{ count: string }>(
        "select count(*) from pg_stat_activity where datname = current_database() and application_name = ''",
      );
      expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
    } finally {
      await observer.end();
      await app.close();
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
  });

  it('returns a bounded 503 for a real stalled TCP connection', async () => {
    const sockets = new Set<import('node:net').Socket>();
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('TCP port unavailable');
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = `postgresql://user:password@127.0.0.1:${address.port}/test`;
    const app = buildApp();
    try {
      const start = Date.now();
      const response = await app.inject({ method: 'GET', url: '/ready' });
      expect(Date.now() - start).toBeLessThan(3000);
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
      expect(response.body).not.toContain('password');
    } finally {
      await app.close();
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
  });

  it('returns 503 and the frozen code when a local PostgreSQL connection is refused', async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('TCP port unavailable');
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = `postgresql://user:password@127.0.0.1:${address.port}/test`;
    const app = buildApp();
    try {
      const response = await app.inject({ method: 'GET', url: '/ready' });
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
      expect(response.body).not.toContain('password');
    } finally {
      await app.close();
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
  });

  it('bounds a real PostgreSQL query when its response stalls and closes the connection', async () => {
    const sockets = new Set<import('node:net').Socket>();
    let sawSelect = false;
    const upstreamUrl = new URL(connectionString);
    const proxy = createServer((socket) => {
      const upstream = createConnection(Number(upstreamUrl.port), upstreamUrl.hostname);
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.on('data', (chunk: Buffer) => {
        if (chunk.includes(Buffer.from('SELECT 1'))) {
          sawSelect = true;
          return;
        }
        upstream.write(chunk);
      });
      upstream.on('data', (chunk: Buffer) => socket.write(chunk));
      socket.on('close', () => upstream.destroy());
      upstream.on('close', () => socket.destroy());
      upstream.on('error', () => socket.destroy());
    });
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    const address = proxy.address();
    if (!address || typeof address === 'string') throw new Error('TCP port unavailable');
    const proxyUrl = new URL(connectionString);
    proxyUrl.hostname = '127.0.0.1';
    proxyUrl.port = String(address.port);
    try {
      const start = Date.now();
      const result = await checkPostgreSQLReadiness({
        connectionString: proxyUrl.toString(),
        timeoutMs: 350,
      });
      expect(result.ready).toBe(false);
      expect(sawSelect).toBe(true);
      expect(Date.now() - start).toBeLessThan(1000);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(sockets.size).toBe(0);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => proxy.close(() => resolve()));
    }
  });

  it('should respect 2000ms total budget on unreachable host', async () => {
    // Use an invalid connection string that will timeout
    const invalidConnectionString =
      'postgresql://user:pass@192.0.2.1:5432/testdb?connect_timeout=2';

    const startTime = Date.now();
    const result = await checkPostgreSQLReadiness({
      connectionString: invalidConnectionString,
      timeoutMs: 2000,
    });
    const elapsed = Date.now() - startTime;

    expect(result.ready).toBe(false);
    // Must be meaningfully tied to the 2000ms budget, not 5000ms
    expect(elapsed).toBeLessThan(3000);
    expect(elapsed).toBeGreaterThanOrEqual(1500);
  });
});
