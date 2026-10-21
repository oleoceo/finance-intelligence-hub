import { afterAll, describe, expect, it } from 'vitest';
import {
  MasterDataError,
  ValidationError,
  ImmutabilityError,
  DependencyError,
  ConcurrencyError,
} from '@finance-hub/core';
import { buildApp } from '../index.js';
import { mapError } from './errors.js';

const cases: [unknown, number, string, string?][] = [
  ...['BOOK', 'ACCOUNT', 'CATEGORY', 'MERCHANT'].flatMap(
    (entity) =>
      [
        [new MasterDataError('private', `${entity}_NOT_FOUND`), 404, `${entity}_NOT_FOUND`],
        [new MasterDataError('private', `${entity}_INACTIVE`), 422, `${entity}_INACTIVE`],
      ] as [unknown, number, string][],
  ),
  ...['RULE', 'SENDER'].map(
    (entity) =>
      [
        new MasterDataError('private', `${entity}_NOT_FOUND`),
        404,
        'VALIDATION_ERROR',
        'resource_not_found',
      ] as [unknown, number, string, string],
  ),
  [new ImmutabilityError('private'), 422, 'VALIDATION_ERROR', 'immutable_field'],
  [new ConcurrencyError('private'), 409, 'VALIDATION_ERROR', 'configuration_changed'],
  [
    new DependencyError('Cannot archive Book referenced as Authorized Sender default'),
    409,
    'DEFAULT_BOOK_IN_USE',
  ],
  [
    new DependencyError('Cannot archive Account referenced as Authorized Sender default'),
    409,
    'DEFAULT_ACCOUNT_IN_USE',
  ],
  [
    new MasterDataError('private', 'RULE_TARGET_CONTEXT_MISMATCH'),
    422,
    'VALIDATION_ERROR',
    'incompatible_targets',
  ],
  [
    new Error('Classification rule must have at least one target'),
    422,
    'VALIDATION_ERROR',
    'missing_target',
  ],
  [new Error('default_account_id requires default_book_id'), 422, 'DEFAULT_ACCOUNT_REQUIRED_BOOK'],
  [
    new MasterDataError('private', 'DEFAULT_ACCOUNT_BOOK_MISMATCH'),
    422,
    'DEFAULT_ACCOUNT_BOOK_MISMATCH',
  ],
  [new MasterDataError('private', 'CURRENCY_MISMATCH'), 422, 'CURRENCY_MISMATCH'],
  [new Error('Parent Category not found'), 404, 'CATEGORY_NOT_FOUND'],
  [
    new ValidationError('Parent Category must belong to the same Book'),
    422,
    'VALIDATION_ERROR',
    'category_parent_book_mismatch',
  ],
  [new ValidationError('Category cannot be its own parent'), 422, 'CATEGORY_CYCLE'],
  [new MasterDataError('private', 'CATEGORY_CYCLE'), 422, 'CATEGORY_CYCLE'],
  [new ValidationError('invalid timezone'), 422, 'VALIDATION_ERROR', 'invalid_request'],
  [
    Object.assign(new Error('postgresql://private'), { code: 'ECONNREFUSED' }),
    503,
    'DATABASE_UNAVAILABLE',
  ],
  [new Error('SQL private stack details'), 500, 'INTERNAL_ERROR'],
  [{ code: '23505', constraint: 'unrecognized_private_constraint' }, 500, 'INTERNAL_ERROR'],
  ...['Book', 'Account', 'Category', 'Authorized Sender'].map(
    (entity) =>
      [
        new ValidationError(`${entity} uniqueness constraint violated`),
        409,
        'VALIDATION_ERROR',
        'duplicate_configuration',
      ] as [unknown, number, string, string],
  ),
];
const pgCases: [string, string, number, string, string?][] = [
  ...[
    'uq_books_normalized_name',
    'uq_accounts_book_normalized_name',
    'uq_categories_root_name_per_book',
    'uq_categories_child_name_per_book_parent',
    'uq_senders_channel_reference',
  ].map(
    (c) =>
      ['23505', c, 409, 'VALIDATION_ERROR', 'duplicate_configuration'] as [
        string,
        string,
        number,
        string,
        string,
      ],
  ),
  ['23503', 'fk_accounts_book_id', 404, 'BOOK_NOT_FOUND'],
  ['23503', 'fk_accounts_book_currency', 422, 'CURRENCY_MISMATCH'],
  ['23503', 'fk_categories_book_id', 404, 'BOOK_NOT_FOUND'],
  ['23503', 'fk_categories_parent', 422, 'VALIDATION_ERROR', 'category_parent_book_mismatch'],
  ['23514', 'categories_no_self_parent', 422, 'CATEGORY_CYCLE'],
  ...['book', 'account', 'category', 'merchant'].map(
    (entity) =>
      ['23503', `fk_rules_target_${entity}`, 404, `${entity.toUpperCase()}_NOT_FOUND`] as [
        string,
        string,
        number,
        string,
      ],
  ),
  ['23514', 'classification_rules_at_least_one_target', 422, 'VALIDATION_ERROR', 'missing_target'],
  ['23503', 'fk_senders_default_book', 404, 'BOOK_NOT_FOUND'],
  ['23503', 'fk_senders_default_account_book', 422, 'DEFAULT_ACCOUNT_BOOK_MISMATCH'],
  ['23514', 'senders_default_account_requires_book', 422, 'DEFAULT_ACCOUNT_REQUIRED_BOOK'],
];
for (const [code, constraint, status, publicCode, reason] of pgCases) {
  const pg = Object.assign(new Error('SQL secret detail'), { code, constraint });
  cases.push([pg, status, publicCode, reason]);
  cases.push([
    new ValidationError('adapter translated failure', undefined, pg),
    status,
    publicCode,
    reason,
  ]);
}
let failure: unknown;
const app = buildApp({
  adminToken: 'synthetic-admin',
  transactions: {
    async runInTransaction() {
      throw failure;
    },
  },
});
afterAll(() => app.close());
describe('deterministic safe error boundary', () => {
  it.each(cases)('maps %j to %i/%s/%s', async (error, status, code, reason) => {
    failure = error;
    expect(mapError(error)).toMatchObject({ status, code, reason });
    const result = await app.inject({
      url: '/api/v1/books',
      headers: { authorization: 'Bearer synthetic-admin', 'x-correlation-id': 't05.errors' },
    });
    expect(result.statusCode).toBe(status);
    expect(result.json()).toEqual({
      error: { code, message: expect.any(String), details: reason ? { reason } : {} },
      meta: { request_id: expect.any(String), correlation_id: 't05.errors' },
    });
    expect(result.body).not.toMatch(/SQL|private|postgresql|stack|synthetic/);
  });
});
