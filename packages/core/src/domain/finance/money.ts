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
    if (typeof amount !== 'string') {
      throw new Error('Money amount must be a string');
    }

    if (typeof currency !== 'string' || currency.length === 0) {
      throw new Error('Money currency must be a non-empty string');
    }

    if (!MONEY_REGEX.test(amount)) {
      throw new Error(
        `Invalid money amount format: "${amount}". Must match ^(0|[1-9][0-9]{0,15})(\\.[0-9]{1,2})?$`,
      );
    }

    // Reject explicit positive sign (regex already rejects, but defensive)
    if (amount.startsWith('+')) {
      throw new Error('Money amount must not have an explicit positive sign');
    }

    // Parse integral and fractional parts using string operations only
    const dotIndex = amount.indexOf('.');
    let integralStr: string;
    let fractionalStr: string;

    if (dotIndex === -1) {
      integralStr = amount;
      fractionalStr = '';
    } else {
      integralStr = amount.substring(0, dotIndex);
      fractionalStr = amount.substring(dotIndex + 1);
    }

    // Reject zero value: both integral and fractional must not be all zeros
    const integralBigInt = BigInt(integralStr);
    const fractionalPadded = fractionalStr.padEnd(2, '0');
    const fractionalValue = parseInt(fractionalPadded, 10);

    if (integralBigInt === 0n && fractionalValue === 0) {
      throw new Error('Money amount must be strictly greater than zero');
    }

    // Check overflow: convert to cents and compare against max
    const cents = integralBigInt * 100n + BigInt(fractionalValue);
    if (cents > MAX_CENTS) {
      throw new Error(
        `Money amount exceeds maximum NUMERIC(18,2): ${amount}. Max is 9999999999999999.99`,
      );
    }

    // Canonicalize to exactly two decimal places
    const canonicalAmount = `${integralStr}.${fractionalPadded}`;

    return new Money(canonicalAmount, currency.toUpperCase());
  }

  /**
   * Returns the canonical decimal string with exactly two fractional digits.
   */
  get amount(): string {
    return this._amount;
  }

  /**
   * Returns the uppercase currency code.
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
   * String representation for debugging/logging.
   */
  toString(): string {
    return `${this._currency} ${this._amount}`;
  }
}
