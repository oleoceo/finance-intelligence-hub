/**
 * Application-owned human_ref generator contract for M04.
 *
 * Requirements:
 * - Uppercase ASCII alphanumeric only: [A-Z0-9]
 * - At most 16 characters
 * - Server-controlled; never accepted from production API input
 * - Generator injectable for deterministic tests
 *
 * The exact format/length within the bound is M04 implementation policy.
 * Database UNIQUE constraint is the final authority on collisions.
 * T02 owns collision-safe persistence via ON CONFLICT DO NOTHING RETURNING.
 */

export interface HumanRefGenerator {
  /** Generate a unique human-readable reference string. */
  generate(): string;
}

const HUMAN_REF_REGEX = /^[A-Z0-9]{1,16}$/;

/**
 * Validate that a string conforms to the human_ref format.
 */
export function isValidHumanRef(value: unknown): value is string {
  return typeof value === 'string' && HUMAN_REF_REGEX.test(value);
}

/**
 * Assert that a value is a valid human_ref, throwing otherwise.
 */
export function assertHumanRef(value: unknown): string {
  if (!isValidHumanRef(value)) {
    throw new Error(
      `Invalid human_ref: "${String(value)}". Must be uppercase ASCII alphanumeric, 1–16 characters.`,
    );
  }
  return value;
}

/**
 * Deterministic human_ref generator for testing.
 * Produces sequential references like "REF0000000000001", "REF0000000000002", etc.
 */
export class DeterministicHumanRefGenerator implements HumanRefGenerator {
  private counter: number;
  private readonly prefix: string;

  constructor(prefix = 'REF') {
    if (!isValidHumanRef(prefix) || prefix.length >= 16) {
      throw new Error('Human reference prefix must use [A-Z0-9] and leave room for a suffix');
    }
    this.counter = 0;
    this.prefix = prefix;
  }

  generate(): string {
    this.counter += 1;
    const suffix = String(this.counter).padStart(16 - this.prefix.length, '0');
    const ref = `${this.prefix}${suffix}`;
    if (!isValidHumanRef(ref)) {
      throw new Error(`DeterministicHumanRefGenerator exhausted: "${ref}" exceeds 16 characters`);
    }
    return ref;
  }

  /** Reset counter for test isolation. */
  reset(): void {
    this.counter = 0;
  }
}
