import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { Client } from 'pg';

// Force single-threaded execution to avoid Docker socket conflicts in WSL2
declare module 'vitest' {
  interface TestContext {
    pool?: string;
  }
}

describe('PostgreSQL Testcontainers Integration', { timeout: 120000 }, () => {
  let container: StartedTestContainer;
  let client: Client;

  beforeAll(async () => {
    // Start ephemeral PostgreSQL 18.6 container
    container = await new GenericContainer('postgres:18.6-bookworm')
      .withEnvironment({
        POSTGRES_DB: 'test_db',
        POSTGRES_USER: 'test_user',
        POSTGRES_PASSWORD: 'test_password',
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections', 1))
      .withStartupTimeout(120000)
      .start();

    const port = container.getMappedPort(5432);
    const host = container.getHost();

    // Wait for port binding to stabilize in WSL2
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Connect using pg
    client = new Client({
      host: host,
      port: port,
      user: 'test_user',
      password: 'test_password',
      database: 'test_db',
    });

    await client.connect();
  });

  afterAll(async () => {
    if (client) {
      await client.end();
    }
    if (container) {
      await container.stop();
    }
  });

  it('should execute a simple SELECT query', async () => {
    const result = await client.query('SELECT 1 as num');
    expect(result.rows[0].num).toBe(1);
  });

  it('should perform CREATE/INSERT/SELECT/DROP smoke test', async () => {
    await client.query('CREATE TABLE smoke_test (id serial PRIMARY KEY, msg text)');
    await client.query("INSERT INTO smoke_test (msg) VALUES ('hello')");

    const selectResult = await client.query('SELECT * FROM smoke_test');
    expect(selectResult.rows).toHaveLength(1);
    expect(selectResult.rows[0].msg).toBe('hello');

    await client.query('DROP TABLE smoke_test');
  });
});
