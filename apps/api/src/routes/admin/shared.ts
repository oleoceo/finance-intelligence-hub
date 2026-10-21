import type { FastifyRequest } from 'fastify';
import type { TransactionPort, MasterDataTransactionContextT04 } from '@finance-hub/core';
import { MasterDataError } from '@finance-hub/core';

export interface ConfigurationOptions {
  transactions: TransactionPort<MasterDataTransactionContextT04>;
  now: () => Date;
}
export function meta(request: FastifyRequest) {
  return {
    request_id: request.id,
    correlation_id: (request as FastifyRequest & { correlationId: string }).correlationId,
  };
}
export function requireResource<T>(record: T | null, entity: string): T {
  if (record === null)
    throw new MasterDataError(
      'Resource not found',
      `${entity === 'ClassificationRule' ? 'RULE' : entity === 'AuthorizedSender' ? 'SENDER' : entity.toUpperCase()}_NOT_FOUND`,
    );
  return record;
}
export function compare(a: string | Date, b: string | Date): number {
  const x = a instanceof Date ? a.getTime() : a;
  const y = b instanceof Date ? b.getTime() : b;
  return x < y ? -1 : x > y ? 1 : 0;
}
