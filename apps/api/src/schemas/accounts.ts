import { Type } from '@fastify/type-provider-typebox';
import {
  accountType,
  currency,
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
  type: accountType,
  institution_name: Type.Optional(nullable(text(160))),
  notes: Type.Optional(nullable(Type.String())),
});
export const updateSchema = patch({
  name: name(160),
  type: accountType,
  currency: currency,
  institution_name: nullable(text(160)),
  notes: nullable(Type.String()),
  active: Type.Boolean(),
});
export const resourceSchema = strict({
  ...timestamps,
  ...archived,
  book_id: uuid,
  name: text(160),
  normalized_name: text(160),
  type: accountType,
  currency: currency,
  institution_name: nullable(text(160)),
  notes: nullable(Type.String()),
});
export const querySchema = strict({ active: activeQuery, book_id: Type.Optional(uuid) });
