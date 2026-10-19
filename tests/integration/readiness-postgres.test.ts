import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { checkPostgreSQLReadiness } from '@finance-hub/database';

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
