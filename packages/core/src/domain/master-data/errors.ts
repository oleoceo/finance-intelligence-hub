/**
 * Domain errors for master-data operations.
 * Transport-agnostic; no HTTP status codes or Fastify concepts.
 */

export class MasterDataError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'MasterDataError';
  }
}

export class ValidationError extends MasterDataError {
  constructor(
    message: string,
    public readonly field?: string,
    public override readonly cause?: unknown,
  ) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class LifecycleError extends MasterDataError {
  constructor(message: string) {
    super(message, 'LIFECYCLE_ERROR');
    this.name = 'LifecycleError';
  }
}

export class ImmutabilityError extends MasterDataError {
  constructor(
    message: string,
    public readonly field?: string,
  ) {
    super(message, 'IMMUTABILITY_ERROR');
    this.name = 'ImmutabilityError';
  }
}

export class DependencyError extends MasterDataError {
  constructor(message: string) {
    super(message, 'DEPENDENCY_ERROR');
    this.name = 'DependencyError';
  }
}

export class ConcurrencyError extends MasterDataError {
  constructor(message: string) {
    super(message, 'CONCURRENCY_ERROR');
    this.name = 'ConcurrencyError';
  }
}
