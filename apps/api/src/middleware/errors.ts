import type { FastifyInstance } from 'fastify';
import {
  MasterDataError,
  ValidationError,
  ImmutabilityError,
  DependencyError,
  ConcurrencyError,
  FinancialError,
} from '@finance-hub/core';
import { meta } from '../routes/admin/shared.js';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly reason?: string,
  ) {
    super(code);
  }
}
const validation = (reason: string, status = 422) =>
  new ApiError(status, 'VALIDATION_ERROR', reason);
const constraints: Record<string, [number, string, string?]> = {
  uq_books_normalized_name: [409, 'VALIDATION_ERROR', 'duplicate_configuration'],
  uq_accounts_book_normalized_name: [409, 'VALIDATION_ERROR', 'duplicate_configuration'],
  uq_categories_root_name_per_book: [409, 'VALIDATION_ERROR', 'duplicate_configuration'],
  uq_categories_child_name_per_book_parent: [409, 'VALIDATION_ERROR', 'duplicate_configuration'],
  uq_senders_channel_reference: [409, 'VALIDATION_ERROR', 'duplicate_configuration'],
  fk_accounts_book_id: [404, 'BOOK_NOT_FOUND'],
  fk_accounts_book_currency: [422, 'CURRENCY_MISMATCH'],
  fk_categories_book_id: [404, 'BOOK_NOT_FOUND'],
  fk_categories_parent: [422, 'VALIDATION_ERROR', 'category_parent_book_mismatch'],
  categories_no_self_parent: [422, 'CATEGORY_CYCLE'],
  fk_rules_target_book: [404, 'BOOK_NOT_FOUND'],
  fk_rules_target_account: [404, 'ACCOUNT_NOT_FOUND'],
  fk_rules_target_category: [404, 'CATEGORY_NOT_FOUND'],
  fk_rules_target_merchant: [404, 'MERCHANT_NOT_FOUND'],
  classification_rules_at_least_one_target: [422, 'VALIDATION_ERROR', 'missing_target'],
  fk_senders_default_book: [404, 'BOOK_NOT_FOUND'],
  fk_senders_default_account_book: [422, 'DEFAULT_ACCOUNT_BOOK_MISMATCH'],
  senders_default_account_requires_book: [422, 'DEFAULT_ACCOUNT_REQUIRED_BOOK'],
};
for (const constraint of [
  'books_currency_format',
  'books_archive_consistency',
  'accounts_type_check',
  'accounts_currency_format',
  'accounts_archive_consistency',
  'categories_type_check',
  'categories_archive_consistency',
  'merchants_archive_consistency',
  'classification_rules_match_type',
  'classification_rules_source',
])
  constraints[constraint] = [422, 'VALIDATION_ERROR', 'invalid_request'];

export function mapError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof ValidationError && error.cause) return mapError(error.cause);
  const e = error as {
    code?: string;
    constraint?: string;
    validation?: unknown;
    message?: string;
  } | null;
  if (e?.code === 'FST_ERR_CTP_INVALID_JSON_BODY' || e?.code === 'FST_ERR_CTP_EMPTY_JSON_BODY')
    return validation('malformed_json', 400);
  if (e?.validation || e?.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE')
    return validation('invalid_request');
  if (
    e?.code &&
    [
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'EHOSTUNREACH',
      '57P01',
      '57P02',
      '57P03',
      '53300',
    ].includes(e.code)
  )
    return new ApiError(503, 'DATABASE_UNAVAILABLE');
  if (e?.code?.startsWith('08')) return new ApiError(503, 'DATABASE_UNAVAILABLE');
  if (e?.code && ['23505', '23503', '23514'].includes(e.code)) {
    const selected = e.constraint ? constraints[e.constraint] : undefined;
    return selected ? new ApiError(...selected) : new ApiError(500, 'INTERNAL_ERROR');
  }
  if (error instanceof ConcurrencyError) return validation('configuration_changed', 409);
  if (error instanceof FinancialError) {
    if (/^(BOOK|ACCOUNT|CATEGORY|MERCHANT)_NOT_FOUND$/.test(error.code))
      return new ApiError(404, error.code);
    if (error.code === 'IDEMPOTENCY_CONFLICT') return new ApiError(409, error.code);
    return new ApiError(422, error.code);
  }
  if (error instanceof ImmutabilityError) return validation('immutable_field');
  if (error instanceof DependencyError)
    return new ApiError(
      409,
      error.message.includes('Account') ? 'DEFAULT_ACCOUNT_IN_USE' : 'DEFAULT_BOOK_IN_USE',
    );
  if (error instanceof MasterDataError) {
    if (/^(BOOK|ACCOUNT|CATEGORY|MERCHANT)_NOT_FOUND$/.test(error.code))
      return new ApiError(404, error.code);
    if (['RULE_NOT_FOUND', 'SENDER_NOT_FOUND'].includes(error.code))
      return validation('resource_not_found', 404);
    if (
      /^(BOOK|ACCOUNT|CATEGORY|MERCHANT)_INACTIVE$/.test(error.code) ||
      [
        'CATEGORY_CYCLE',
        'CURRENCY_MISMATCH',
        'DEFAULT_ACCOUNT_REQUIRED_BOOK',
        'DEFAULT_ACCOUNT_BOOK_MISMATCH',
      ].includes(error.code)
    )
      return new ApiError(422, error.code);
    if (error.code === 'RULE_TARGET_CONTEXT_MISMATCH') return validation('incompatible_targets');
  }
  // Legacy T02/T03 errors carry stable messages. Only these known messages are translated;
  // none of the original text or infrastructure details are sent to the client.
  const message = error instanceof Error ? error.message : '';
  const missing = /^(Book|Account|Category|Merchant) not found$/.exec(message);
  if (missing) return new ApiError(404, `${missing[1].toUpperCase()}_NOT_FOUND`);
  if (message === 'Parent Category not found') return new ApiError(404, 'CATEGORY_NOT_FOUND');
  if (message === 'Parent Category must belong to the same Book')
    return validation('category_parent_book_mismatch');
  if (message === 'Category cannot be its own parent') return new ApiError(422, 'CATEGORY_CYCLE');
  if (message === 'Parent Category must be active') return new ApiError(422, 'CATEGORY_INACTIVE');
  if (
    [
      'Cannot create Account for inactive Book',
      'Cannot create Category for inactive Book',
      'Cannot reparent Category in inactive Book',
    ].includes(message)
  )
    return new ApiError(422, 'BOOK_INACTIVE');
  if (message === 'Classification rule must have at least one target')
    return validation('missing_target');
  if (message === 'default_account_id requires default_book_id')
    return new ApiError(422, 'DEFAULT_ACCOUNT_REQUIRED_BOOK');
  if (message === 'Default account must belong to the same book as default book')
    return new ApiError(422, 'DEFAULT_ACCOUNT_BOOK_MISMATCH');
  if (error instanceof ValidationError) {
    if (/^(Book|Account|Category|Authorized Sender) uniqueness constraint violated$/.test(message))
      return validation('duplicate_configuration', 409);
    return validation('invalid_request');
  }
  return new ApiError(500, 'INTERNAL_ERROR');
}
export function installErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    const mapped = mapError(error);
    return reply.code(mapped.status).send({
      error: {
        code: mapped.code,
        message:
          mapped.status >= 500
            ? 'The service could not complete the request.'
            : 'The request could not be accepted.',
        details: mapped.reason ? { reason: mapped.reason } : {},
      },
      meta: meta(request),
    });
  });
}
