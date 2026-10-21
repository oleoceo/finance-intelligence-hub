import { Type } from '@fastify/type-provider-typebox';
import {
  currency,
  name,
  text,
  strict,
  patch,
  timestamps,
  activeQuery,
  archived,
} from './configuration.js';
export const createSchema = strict({
  name: name(120),
  currency: currency,
  timezone: Type.Optional(name(64)),
});
export const updateSchema = patch({
  name: name(120),
  currency: currency,
  timezone: name(64),
  active: Type.Boolean(),
});
export const resourceSchema = strict({
  ...timestamps,
  ...archived,
  name: text(120),
  normalized_name: text(120),
  currency: currency,
  timezone: text(64),
});
export const querySchema = strict({ active: activeQuery });
