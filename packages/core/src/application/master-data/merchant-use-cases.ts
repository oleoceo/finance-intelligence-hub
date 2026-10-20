/**
 * Merchant configuration use cases (M03-T03).
 *
 * Implements CreateMerchant, GetMerchant, ListMerchants, UpdateMerchant, ArchiveMerchant.
 * Merchant normalized_name is NOT globally unique; duplicates are permitted.
 * Core logic only; no Database/Kysely/pg/Fastify imports.
 */

import { v7 as uuidv7 } from 'uuid';
import { normalizeName, validateNonBlankName } from '../../domain/master-data/normalization.js';
import { archiveEntity } from '../../domain/master-data/lifecycle.js';
import type { MasterDataTransactionContext, MerchantRecord } from '../ports/master-data-ports.js';

export interface CreateMerchantInput {
  name: string;
  type?: string | null;
  taxIdentifier?: string | null;
}

export async function createMerchant(
  input: CreateMerchantInput,
  ctx: MasterDataTransactionContext,
  now: Date,
): Promise<MerchantRecord> {
  // Validate name
  const trimmedRaw = validateNonBlankName(input.name);
  const normalizedName = normalizeName(input.name);

  // Generate UUIDv7
  const id = uuidv7();

  // No locking required for create - merchants are global with no hierarchy
  // and normalized_name allows duplicates (no global lock needed)

  const record: MerchantRecord = {
    id,
    name: trimmedRaw,
    normalizedName,
    type: input.type ?? null,
    taxIdentifier: input.taxIdentifier ?? null,
    active: true,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await ctx.merchants.create(record);
  return record;
}

export async function getMerchant(
  id: string,
  ctx: MasterDataTransactionContext,
): Promise<MerchantRecord | null> {
  return ctx.merchants.findById(id);
}

export async function listMerchants(ctx: MasterDataTransactionContext): Promise<MerchantRecord[]> {
  return ctx.merchants.find();
}

export interface UpdateMerchantInput {
  id: string;
  name?: string;
  type?: string | null;
  taxIdentifier?: string | null;
  active?: boolean; // lifecycle changes
}

export async function updateMerchant(
  input: UpdateMerchantInput,
  ctx: MasterDataTransactionContext,
  now: Date,
): Promise<MerchantRecord> {
  const existing = await ctx.merchants.findById(input.id);
  if (!existing) {
    throw new Error('Merchant not found');
  }

  // Lock the merchant row before validation
  await ctx.locks.acquireLocks({ merchants: [input.id] });

  // Re-read merchant after lock
  const current = await ctx.merchants.findById(input.id);
  if (!current) {
    throw new Error('Merchant not found');
  }

  let newName = current.name;
  let newNormalizedName = current.normalizedName;
  let newType = current.type;
  let newTaxIdentifier = current.taxIdentifier;

  // Handle name update
  if (input.name !== undefined) {
    validateNonBlankName(input.name);
    newName = validateNonBlankName(input.name);
    newNormalizedName = normalizeName(input.name);
  }

  // Handle type update
  if (input.type !== undefined) {
    newType = input.type;
  }

  // Handle taxIdentifier update
  if (input.taxIdentifier !== undefined) {
    newTaxIdentifier = input.taxIdentifier;
  }

  const lifecycle =
    input.active === false
      ? archiveEntity(current, now)
      : input.active === true
        ? { active: true, archivedAt: null }
        : { active: current.active, archivedAt: current.archivedAt };

  const updated = await ctx.merchants.update({
    id: input.id,
    name: newName,
    normalizedName: newNormalizedName,
    type: newType,
    taxIdentifier: newTaxIdentifier,
    ...lifecycle,
    updatedAt: now,
  });

  return updated;
}

export async function archiveMerchant(
  id: string,
  ctx: MasterDataTransactionContext,
  now: Date,
): Promise<MerchantRecord> {
  const existing = await ctx.merchants.findById(id);
  if (!existing) {
    throw new Error('Merchant not found');
  }

  // Lock the merchant row
  await ctx.locks.acquireLocks({ merchants: [id] });

  // Re-read merchant after lock
  const current = await ctx.merchants.findById(id);
  if (!current) {
    throw new Error('Merchant not found');
  }

  const lifecycleState = archiveEntity(
    { active: current.active, archivedAt: current.archivedAt },
    now,
  );

  const archived = await ctx.merchants.archive({
    id,
    active: lifecycleState.active,
    archivedAt: lifecycleState.archivedAt,
    updatedAt: now,
  });

  return archived;
}

export async function reactivateMerchant(
  id: string,
  ctx: MasterDataTransactionContext,
  now: Date,
): Promise<MerchantRecord> {
  const existing = await ctx.merchants.findById(id);
  if (!existing) {
    throw new Error('Merchant not found');
  }

  // Lock the merchant row
  await ctx.locks.acquireLocks({ merchants: [id] });

  // Re-read after lock
  const current = await ctx.merchants.findById(id);
  if (!current) {
    throw new Error('Merchant not found');
  }

  const reactivated = await ctx.merchants.archive({
    id,
    active: true,
    archivedAt: null,
    updatedAt: now,
  });

  return reactivated;
}
