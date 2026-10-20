/**
 * Classification Rule domain type and validation.
 */

export interface ClassificationRuleRecord {
  id: string;
  priority: number;
  active: boolean;
  matchType: 'exact' | 'contains';
  pattern: string;
  normalizedPattern: string;
  targetBookId: string | null;
  targetAccountId: string | null;
  targetCategoryId: string | null;
  targetMerchantId: string | null;
  source: 'manual' | 'system';
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateClassificationRuleInput {
  priority: number;
  matchType: string;
  pattern: string;
  targetBookId?: string | null;
  targetAccountId?: string | null;
  targetCategoryId?: string | null;
  targetMerchantId?: string | null;
}

export interface UpdateClassificationRuleInput {
  id: string;
  priority?: number;
  matchType?: string;
  pattern?: string;
  targetBookId?: string | null;
  targetAccountId?: string | null;
  targetCategoryId?: string | null;
  targetMerchantId?: string | null;
  active?: boolean;
}

const VALID_MATCH_TYPES = ['exact', 'contains'] as const;

export function validateMatchType(matchType: string): void {
  if (!VALID_MATCH_TYPES.includes(matchType as (typeof VALID_MATCH_TYPES)[number])) {
    throw new Error(`Match type must be one of: ${VALID_MATCH_TYPES.join(', ')}`);
  }
}

export function validateAtLeastOneTarget(input: CreateClassificationRuleInput): void {
  const hasTarget =
    input.targetBookId != null ||
    input.targetAccountId != null ||
    input.targetCategoryId != null ||
    input.targetMerchantId != null;

  if (!hasTarget) {
    throw new Error('Classification rule must have at least one target');
  }
}

export function normalizePattern(pattern: string): string {
  return pattern.trim().toLowerCase();
}

export function validatePriority(priority: number): void {
  if (!Number.isInteger(priority) || priority < 0) {
    throw new Error('Priority must be a non-negative integer');
  }
}
export interface UpdateClassificationRuleRepoInput {
  id: string;
  priority?: number;
  matchType?: string;
  pattern?: string;
  normalizedPattern?: string;
  targetBookId?: string | null;
  targetAccountId?: string | null;
  targetCategoryId?: string | null;
  targetMerchantId?: string | null;
  active?: boolean;
  updatedAt: Date;
}