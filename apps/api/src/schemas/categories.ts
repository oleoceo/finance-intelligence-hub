import { Type } from '@fastify/type-provider-typebox';
import {
  categoryType,
  name,
  nullable,
  text,
  uuid,
  strict,
  patch,
  timestamps,
  activeQuery,
  archived,
} from './configuration.js';
export const createSchema = strict({
  book_id: uuid,
  name: name(160),
  parent_category_id: Type.Optional(nullable(uuid)),
  type: Type.Optional(categoryType),
});
export const updateSchema = patch({
  name: name(160),
  parent_category_id: nullable(uuid),
  type: categoryType,
  active: Type.Boolean(),
});
export const resourceSchema = strict({
  ...timestamps,
  ...archived,
  book_id: uuid,
  name: text(160),
  normalized_name: text(160),
  parent_category_id: nullable(uuid),
  type: categoryType,
});
export const querySchema = strict({
  active: activeQuery,
  book_id: Type.Optional(uuid),
  parent_category_id: Type.Optional(uuid),
  type: Type.Optional(categoryType),
});
