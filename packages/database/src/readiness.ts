import { Client, type QueryConfig } from 'pg';

export interface ReadinessCheckOptions {
  connectionString: string;
  timeoutMs?: number;
}

export interface ReadinessResult {
  ready: boolean;
}

/**
 * Performs a single, bounded PostgreSQL readiness check using a monotonic deadline.
 * - One attempt only; no retries.
 * - Total budget of 2000 ms (configurable) shared between connect and query.
 * - Uses SELECT 1 as a minimal read-only query.
 * - Never mutates schema or data.
 * - Returns { ready: true/false }; never exposes raw errors or credentials.
 */
export async function checkPostgreSQLReadiness(
  options: ReadinessCheckOptions,
): Promise<ReadinessResult> {
  const totalBudget = options.timeoutMs ?? 2000;
  const deadline = Date.now() + totalBudget;

  // Phase 1: Connection with remaining budget
  const connectBudget = Math.max(0, deadline - Date.now());
  if (connectBudget <= 0) {
    return { ready: false };
  }

  const client = new Client({
    connectionString: options.connectionString,
    connectionTimeoutMillis: connectBudget,
    query_timeout: totalBudget,
    statement_timeout: totalBudget,
  });

  try {
    await client.connect();

    // Phase 2: Query with remaining budget
    const queryBudget = Math.max(0, deadline - Date.now());
    if (queryBudget <= 0) {
      return { ready: false };
    }

    // Bound the query by the remaining total deadline, including a stalled response.
    const query: QueryConfig & { query_timeout: number } = {
      text: 'SELECT 1',
      query_timeout: queryBudget,
    };
    await client.query(query);

    return { ready: true };
  } catch {
    return { ready: false };
  } finally {
    // Clean up client connection
    try {
      await client.end();
    } catch {
      // Ignore cleanup errors
    }
  }
}
