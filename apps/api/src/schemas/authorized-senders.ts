import { Type } from '@fastify/type-provider-typebox';
import {
  name,
  nullable,
  text,
  uuid,
  strict,
  patch,
  timestamps,
  activeQuery,
} from './configuration.js';
export const createSchema = strict({
  channel: name(32),
  sender_reference: name(255),
  name: Type.Optional(nullable(text(160))),
  default_book_id: Type.Optional(nullable(uuid)),
  default_account_id: Type.Optional(nullable(uuid)),
  active: Type.Optional(Type.Boolean()),
});
export const updateSchema = patch({
  name: nullable(text(160)),
  default_book_id: nullable(uuid),
  default_account_id: nullable(uuid),
  active: Type.Boolean(),
});
export const resourceSchema = strict({
  ...timestamps,
  channel: text(32),
  sender_reference: text(255),
  name: nullable(text(160)),
  default_book_id: nullable(uuid),
  default_account_id: nullable(uuid),
});
export const querySchema = strict({ active: activeQuery, channel: Type.Optional(name(32)) });
