/**
 * Deterministic name normalization primitive.
 *
 * Rules:
 * - Trim leading/trailing whitespace
 * - Lowercase deterministically
 * - Collapse consecutive whitespace into one space
 * - Idempotent
 *
 * Does NOT perform:
 * - Accent stripping
 * - Punctuation removal
 * - Unicode transliteration
 * - Locale-dependent transformations
 */

export function normalizeName(raw: string): string {
  if (raw === null || raw === undefined) {
    throw new Error('Name cannot be null or undefined');
  }

  if (typeof raw !== 'string') {
    throw new Error('Name must be a string');
  }

  // Trim leading/trailing whitespace
  let result = raw.trim();

  // Lowercase
  result = result.toLowerCase();

  // Collapse consecutive whitespace into single space
  result = result.replace(/\s+/g, ' ');

  return result;
}

/**
 * Validates that a name is not blank after trimming.
 * Returns the trimmed raw value for separate preservation.
 */
export function validateNonBlankName(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error('Name cannot be blank');
  }
  return trimmed;
}
