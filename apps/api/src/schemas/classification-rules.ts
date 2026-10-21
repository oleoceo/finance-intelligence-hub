import { Type } from '@fastify/type-provider-typebox';
import {
  matchType,
  name,
  nullable,
  priority,
  text,
  uuid,
  strict,
  patch,
  timestamps,
  activeQuery,
} from './configuration.js';
export const createSchema = strict({
  priority: Type.Optional(priority),
  match_type: matchType,
  pattern: name(500),
  target_book_id: Type.Optional(nullable(uuid)),
  target_account_id: Type.Optional(nullable(uuid)),
  target_category_id: Type.Optional(nullable(uuid)),
  target_merchant_id: Type.Optional(nullable(uuid)),
});
export const updateSchema = patch({
  priority: priority,
  match_type: matchType,
  pattern: name(500),
  target_book_id: nullable(uuid),
  target_account_id: nullable(uuid),
  target_category_id: nullable(uuid),
  target_merchant_id: nullable(uuid),
  active: Type.Boolean(),
});
export const resourceSchema = strict({
  ...timestamps,
  priority: priority,
  match_type: matchType,
  pattern: text(500),
  normalized_pattern: text(500),
  target_book_id: nullable(uuid),
  target_account_id: nullable(uuid),
  target_category_id: nullable(uuid),
  target_merchant_id: nullable(uuid),
  source: Type.Union([Type.Literal('manual'), Type.Literal('system')]),
});
export const querySchema = strict({
  active: activeQuery,
  match_type: Type.Optional(matchType),
  target_book_id: Type.Optional(uuid),
});
