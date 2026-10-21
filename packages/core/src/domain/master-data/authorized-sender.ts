/**
 * Authorized Sender domain type and validation.
 */
export interface AuthorizedSenderRecord {
  id: string;
  channel: string;
  senderReference: string;
  name: string | null;
  defaultBookId: string | null;
  defaultAccountId: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAuthorizedSenderInput {
  channel: string;
  senderReference: string;
  name?: string | null;
  defaultBookId?: string | null;
  defaultAccountId?: string | null;
  active?: boolean;
}

export interface UpdateAuthorizedSenderInput {
  id: string;
  name?: string | null;
  defaultBookId?: string | null;
  defaultAccountId?: string | null;
  active?: boolean;
}

export function validateChannel(channel: string): void {
  if (channel.trim().length === 0) {
    throw new Error('Channel must be a non-empty string');
  }
  if (channel.length > 32) {
    throw new Error('Channel must not exceed 32 characters');
  }
}

export function validateSenderReference(senderReference: string): void {
  const trimmed = senderReference.trim();
  if (trimmed.length === 0) {
    throw new Error('Sender reference must be a non-empty string');
  }
  if (senderReference.length > 255) {
    throw new Error('Sender reference must not exceed 255 characters');
  }
}

export function validateDefaultConsistency(input: {
  defaultBookId: string | null;
  defaultAccountId: string | null;
}): void {
  if (input.defaultAccountId != null && input.defaultBookId == null) {
    throw new Error('default_account_id requires default_book_id');
  }
}

export interface UpdateAuthorizedSenderRepoInput {
  id: string;
  name?: string | null;
  defaultBookId?: string | null;
  defaultAccountId?: string | null;
  active?: boolean;
  updatedAt: Date;
}
