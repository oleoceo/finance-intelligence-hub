/**
 * Core unit tests for Merchant configuration (M03-T03).
 *
 * Tests:
 * - Normalization
 * - Create/get/list/update/archive/reactivate
 * - Duplicate normalized names permitted
 * - No global uniqueness enforcement
 * - Lifecycle semantics
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createMerchant,
  getMerchant,
  listMerchants,
  updateMerchant,
  archiveMerchant,
  reactivateMerchant,
} from './merchant-use-cases.js';
import type {
  MasterDataTransactionContext,
  MerchantRepository,
} from '../ports/master-data-ports.js';

function createMockContext(
  overrides?: Partial<MasterDataTransactionContext>,
): MasterDataTransactionContext {
  const mockMerchants = {
    findById: vi.fn(),
    findByNormalizedName: vi.fn(),
    find: vi.fn(),
    findByIds: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
  };

  const mockLocks = {
    acquireLocks: vi.fn(),
  };

  const base: MasterDataTransactionContext = {
    books: {
      findById: vi.fn(),
      findByName: vi.fn(),
      find: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      archive: vi.fn(),
    } as never,
    accounts: {
      findById: vi.fn(),
      findByBookId: vi.fn(),
      find: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      archive: vi.fn(),
    } as never,
    categories: {
      findById: vi.fn(),
      findByBookId: vi.fn(),
      find: vi.fn(),
      findByIds: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      archive: vi.fn(),
    } as never,
    merchants: mockMerchants as unknown as MerchantRepository,
    locks: mockLocks as never,
    financialUsage: {
      hasBookUsage: vi.fn(),
      hasAccountUsage: vi.fn(),
    } as never,
    senderDefaults: {
      hasBookDefault: vi.fn(),
      hasAccountDefault: vi.fn(),
    } as never,
  };

  return { ...base, ...overrides } as MasterDataTransactionContext;
}

describe('Merchant Use Cases - Unit', () => {
  describe('createMerchant', () => {
    it('should create a merchant with normalized name', async () => {
      const ctx = createMockContext();
      const now = new Date();

      const result = await createMerchant({ name: 'Test Merchant' }, ctx, now);

      expect(result.name).toBe('Test Merchant');
      expect(result.normalizedName).toBe('test merchant');
      expect(result.type).toBeNull();
      expect(result.taxIdentifier).toBeNull();
      expect(result.active).toBe(true);
    });

    it('should normalize name deterministically', async () => {
      const ctx = createMockContext();
      const now = new Date();

      const result = await createMerchant({ name: ' My Merchant ' }, ctx, now);
      expect(result.normalizedName).toBe('my merchant');
      expect(result.name).toBe('My Merchant');
    });

    it('should accept optional type and tax identifier', async () => {
      const ctx = createMockContext();
      const now = new Date();

      const result = await createMerchant(
        { name: 'Typed Merchant', type: 'retail', taxIdentifier: '12.345.678/0001-90' },
        ctx,
        now,
      );

      expect(result.type).toBe('retail');
      expect(result.taxIdentifier).toBe('12.345.678/0001-90');
    });

    it('should allow duplicate normalized names', async () => {
      const ctx = createMockContext();
      const now = new Date();

      // First merchant
      const m1 = await createMerchant({ name: 'Duplicate Name' }, ctx, now);
      expect(m1.normalizedName).toBe('duplicate name');

      // Second merchant with same normalized name - should succeed
      const m2 = await createMerchant({ name: 'duplicate name' }, ctx, now);
      expect(m2.normalizedName).toBe('duplicate name');
      expect(m2.id).not.toBe(m1.id);
    });
  });

  describe('getMerchant and listMerchants', () => {
    it('should get merchant by id', async () => {
      const merchId = 'merch-get-1';
      const merchant = {
        id: merchId,
        name: 'Get Me',
        normalizedName: 'get me',
        type: 'retail',
        taxIdentifier: null,
        active: true,
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ctx = createMockContext({
        merchants: {
          findById: vi.fn(async () => merchant),
          findByNormalizedName: vi.fn(),
          find: vi.fn(),
          findByIds: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          archive: vi.fn(),
        } as never,
      });

      const result = await getMerchant(merchId, ctx);
      expect(result?.id).toBe(merchId);
    });

    it('should list all merchants', async () => {
      const merchants = [
        {
          id: 'm1',
          name: 'A',
          normalizedName: 'a',
          type: null,
          taxIdentifier: null,
          active: true,
          archivedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'm2',
          name: 'B',
          normalizedName: 'b',
          type: null,
          taxIdentifier: null,
          active: true,
          archivedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const ctx = createMockContext({
        merchants: {
          findById: vi.fn(),
          findByNormalizedName: vi.fn(),
          find: vi.fn(async () => merchants),
          findByIds: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          archive: vi.fn(),
        } as never,
      });

      const result = await listMerchants(ctx);
      expect(result).toHaveLength(2);
    });

    it('should find merchants by normalized name (may return multiple)', async () => {
      const merchants = [
        {
          id: 'm1',
          name: 'First',
          normalizedName: 'dup',
          type: null,
          taxIdentifier: null,
          active: true,
          archivedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'm2',
          name: 'Second',
          normalizedName: 'dup',
          type: null,
          taxIdentifier: null,
          active: true,
          archivedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const ctx = createMockContext({
        merchants: {
          findById: vi.fn(),
          findByNormalizedName: vi.fn(async () => merchants),
          find: vi.fn(),
          findByIds: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          archive: vi.fn(),
        } as never,
      });

      const result = await ctx.merchants.findByNormalizedName('dup');
      expect(result).toHaveLength(2);
    });
  });

  describe('updateMerchant', () => {
    it('should update merchant name', async () => {
      const merchId = 'merch-update-1';
      const existing = {
        id: merchId,
        name: 'Old Name',
        normalizedName: 'old name',
        type: 'retail',
        taxIdentifier: null,
        active: true,
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ctx = createMockContext({
        merchants: {
          findById: vi.fn(async () => existing),
          findByNormalizedName: vi.fn(),
          find: vi.fn(),
          findByIds: vi.fn(),
          create: vi.fn(),
          update: vi.fn(
            async (input: {
              id: string;
              name?: string;
              normalizedName?: string;
              type?: string | null;
              taxIdentifier?: string | null;
              updatedAt: Date;
            }) => ({
              id: merchId,
              name: input.name ?? 'Old Name',
              normalizedName: input.normalizedName ?? 'old name',
              type: input.type ?? 'retail',
              taxIdentifier: input.taxIdentifier ?? null,
              active: true,
              archivedAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
          ),
          archive: vi.fn(),
        } as never,
      });

      const result = await updateMerchant({ id: merchId, name: 'New Name' }, ctx, new Date());
      expect(result.name).toBe('New Name');
      expect(result.normalizedName).toBe('new name');
    });

    it('should update type and tax identifier', async () => {
      const merchId = 'merch-update-2';
      const existing = {
        id: merchId,
        name: 'Merchant',
        normalizedName: 'merchant',
        type: null,
        taxIdentifier: null,
        active: true,
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ctx = createMockContext({
        merchants: {
          findById: vi.fn(async () => existing),
          findByNormalizedName: vi.fn(),
          find: vi.fn(),
          findByIds: vi.fn(),
          create: vi.fn(),
          update: vi.fn(
            async (input: {
              id: string;
              name?: string;
              normalizedName?: string;
              type?: string | null;
              taxIdentifier?: string | null;
              updatedAt: Date;
            }) => ({
              id: merchId,
              name: input.name ?? 'Merchant',
              normalizedName: input.normalizedName ?? 'merchant',
              type: input.type ?? null,
              taxIdentifier: input.taxIdentifier ?? null,
              active: true,
              archivedAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
          ),
          archive: vi.fn(),
        } as never,
      });

      const result = await updateMerchant(
        { id: merchId, type: 'wholesale', taxIdentifier: '98.765.432/0001-10' },
        ctx,
        new Date(),
      );
      expect(result.type).toBe('wholesale');
      expect(result.taxIdentifier).toBe('98.765.432/0001-10');
    });

    it('should reject missing merchant', async () => {
      const ctx = createMockContext({
        merchants: {
          findById: vi.fn(async () => null),
          findByNormalizedName: vi.fn(),
          find: vi.fn(),
          findByIds: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          archive: vi.fn(),
        } as never,
      });

      await expect(
        updateMerchant({ id: 'non-existent', name: 'New' }, ctx, new Date()),
      ).rejects.toThrow('Merchant not found');
    });
  });

  describe('archiveMerchant', () => {
    it('should archive an active merchant', async () => {
      const merchId = 'merch-archive-1';
      const existing = {
        id: merchId,
        name: 'Archivable',
        normalizedName: 'archivable',
        type: 'retail',
        taxIdentifier: null,
        active: true,
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const now = new Date();

      const ctx = createMockContext({
        merchants: {
          findById: vi.fn(async () => existing),
          findByNormalizedName: vi.fn(),
          find: vi.fn(),
          findByIds: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          archive: vi.fn(
            async (input: {
              id: string;
              active: boolean;
              archivedAt: Date | null;
              updatedAt: Date;
            }) => ({
              ...existing,
              active: input.active,
              archivedAt: input.archivedAt,
              updatedAt: input.updatedAt,
            }),
          ),
        } as never,
      });

      const result = await archiveMerchant(merchId, ctx, now);
      expect(result.active).toBe(false);
      expect(result.archivedAt).toEqual(now);
    });
  });

  describe('reactivateMerchant', () => {
    it('should reactivate an archived merchant', async () => {
      const merchId = 'merch-reactivate-1';
      const existing = {
        id: merchId,
        name: 'Reactivatable',
        normalizedName: 'reactivatable',
        type: 'retail',
        taxIdentifier: null,
        active: false,
        archivedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ctx = createMockContext({
        merchants: {
          findById: vi.fn(async () => existing),
          findByNormalizedName: vi.fn(),
          find: vi.fn(),
          findByIds: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          archive: vi.fn(
            async (input: {
              id: string;
              active: boolean;
              archivedAt: Date | null;
              updatedAt: Date;
            }) => ({
              ...existing,
              active: input.active,
              archivedAt: input.archivedAt,
              updatedAt: input.updatedAt,
            }),
          ),
        } as never,
      });

      const result = await reactivateMerchant(merchId, ctx, new Date());
      expect(result.active).toBe(true);
      expect(result.archivedAt).toBeNull();
    });
  });
});

describe('Merchant combined lifecycle patches', () => {
  it('applies archive and reactivation fields, preserving repeated archive timestamp', async () => {
    const ctx = createMockContext();
    const now = new Date('2026-01-01');
    let row = await createMerchant({ name: 'initial' }, ctx, now);
    vi.mocked(ctx.merchants.findById).mockImplementation(async () => row);
    vi.mocked(ctx.merchants.update).mockImplementation(async (patch) => {
      row = { ...row, ...patch };
      return row;
    });
    expect(
      await updateMerchant({ id: row.id, name: ' NEW  NAME ', active: false }, ctx, now),
    ).toMatchObject({
      name: 'NEW  NAME',
      normalizedName: 'new name',
      active: false,
      archivedAt: now,
    });
    expect(
      await updateMerchant(
        { id: row.id, name: 'again', active: false },
        ctx,
        new Date('2026-02-01'),
      ),
    ).toMatchObject({ name: 'again', archivedAt: now });
    expect(
      await updateMerchant(
        { id: row.id, type: 'retail', taxIdentifier: '123', active: true },
        ctx,
        now,
      ),
    ).toMatchObject({ type: 'retail', taxIdentifier: '123', active: true, archivedAt: null });
    expect(ctx.merchants.archive).not.toHaveBeenCalled();
    expect(ctx.merchants.update).toHaveBeenCalledTimes(3);
  });
});
