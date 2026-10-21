import { timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { ApiError } from './errors.js';

export interface Credentials {
  adminToken?: string;
  ingestToken?: string;
}
function matches(actual: string, expected: string | undefined) {
  if (!expected) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function adminAuthentication(credentials: Credentials) {
  if (credentials.adminToken && credentials.adminToken === credentials.ingestToken)
    throw new Error('Administrative and ingest credentials must be distinct');
  return async (request: FastifyRequest) => {
    const match = /^Bearer ([^\s]+)$/i.exec(request.headers.authorization ?? '');
    if (!match) throw new ApiError(401, 'UNAUTHORIZED');
    if (matches(match[1], credentials.adminToken)) return;
    if (matches(match[1], credentials.ingestToken)) throw new ApiError(403, 'INSUFFICIENT_SCOPE');
    throw new ApiError(401, 'UNAUTHORIZED');
  };
}
