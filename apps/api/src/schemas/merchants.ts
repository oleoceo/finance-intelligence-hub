import { Type } from '@fastify/type-provider-typebox';
import {
  name,
  nullable,
  text,
  strict,
  patch,
  timestamps,
  activeQuery,
  archived,
} from './configuration.js';
export const createSchema = strict({
  name: name(200),
  type: Type.Optional(nullable(text(50))),
  tax_identifier: Type.Optional(nullable(text(32))),
});
export const updateSchema = patch({
  name: name(200),
  type: nullable(text(50)),
  tax_identifier: nullable(text(32)),
  active: Type.Boolean(),
});
export const resourceSchema = strict({
  ...timestamps,
  ...archived,
  name: text(200),
  normalized_name: text(200),
  type: nullable(text(50)),
  tax_identifier: nullable(text(32)),
});
export const querySchema = strict({ active: activeQuery });
