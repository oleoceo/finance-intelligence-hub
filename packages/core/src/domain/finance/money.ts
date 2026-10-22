/**
 * Immutable Money value object for V0.1 financial amounts.
 *
 * Canonical representation is a decimal string with exactly two fractional digits.
 * Validation uses string/BigInt-safe logic only; never Number or floating-point arithmetic.
 *
 * Accepted syntax: /^(?:0|[1-9][0-9]{0,15})(?:\.[0-9]{1,2})?$/
 * Value must be strictly greater than zero.
 * Maximum value: 9999999999999999.99 (NUMERIC(18,2)).
 */

const MONEY_REGEX = /^(?:0|[1-9][0-9]{0,15})(?:\.[0-9]{1,2})?$/;

/**
 * Maximum amount in cents as BigInt: 999999999999999999 (18 digits total).
 */
const MAX_CENTS = BigInt('999999999999999999');

/** Validate and canonicalize an amount without inventing a currency. */
export function canonicalizeMoneyAmount(amount: string): string {
  if (typeof amount !== 'string') {
    throw new Error('Money amount must be a string');
  }
  if (!MONEY_REGEX.test(amount)) {
    throw new Error(
      `Invalid money amount format: "${amount}". Must match ^(0|[1-9][0-9]{0,15})(\\.[0-9]{1,2})?$`,
    );
  }
  if (amount.startsWith('+')) {
    throw new Error('Money amount must not have an explicit positive sign');
  }
  const dotIndex = amount.indexOf('.');
  const integralStr = dotIndex === -1 ? amount : amount.substring(0, dotIndex);
  const fractionalStr = dotIndex === -1 ? '' : amount.substring(dotIndex + 1);
  const integralBigInt = BigInt(integralStr);
  const fractionalPadded = fractionalStr.padEnd(2, '0');
  const fractionalValue = fractionalPadded === '' ? 0n : BigInt(fractionalPadded);
  if (integralBigInt === 0n && fractionalValue === 0n) {
    throw new Error('Money amount must be strictly greater than zero');
  }
  const cents = integralBigInt * 100n + fractionalValue;
  if (cents > MAX_CENTS) {
    throw new Error(
      `Money amount exceeds maximum NUMERIC(18,2): ${amount}. Max is 9999999999999999.99`,
    );
  }
  return `${integralStr}.${fractionalPadded}`;
}

export class Money {
  private readonly _amount: string;
  private readonly _currency: string;

  private constructor(amount: string, currency: string) {
    this._amount = amount;
    this._currency = currency;
  }

  /**
   * Create a Money instance from a decimal string amount and currency code.
   * Validates strictly per M04 contract.
   */
  static create(amount: string, currency: string): Money {
    const canonicalAmount = canonicalizeMoneyAmount(amount);
    if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) {
      throw new Error('Money currency must match [A-Z]{3}');
    }
    return new Money(canonicalAmount, currency);
  }

  /**
   * Returns the canonical decimal string with exactly two fractional digits.
   */
  get amount(): string {
    return this._amount;
  }

  /**
   * Returns the validated uppercase currency code.
   */
  get currency(): string {
    return this._currency;
  }

  /**
   * Value equality: two Money instances are equal iff amount and currency match exactly.
   */
  equals(other: Money): boolean {
    return this._amount === other._amount && this._currency === other._currency;
  }

  /**
   * Canonical decimal serialization.
   */
  toString(): string {
    return this._amount;
  }
}
