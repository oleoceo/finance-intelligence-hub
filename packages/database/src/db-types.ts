/**
 * Shared database type definitions for Kysely integration.
 *
 * This file centralizes the DB schema types used across all database adapters
 * to ensure type consistency and avoid incompatible Transaction/Kysely types.
 */

export interface DB {
  books: {
    id: string;
    name: string;
    normalized_name: string;
    currency: string;
    timezone: string;
    active: boolean;
    archived_at: Date | null;
    created_at: Date;
    updated_at: Date;
  };
  accounts: {
    id: string;
    book_id: string;
    name: string;
    normalized_name: string;
    type: string;
    currency: string;
    institution_name: string | null;
    notes: string | null;
    active: boolean;
    archived_at: Date | null;
    created_at: Date;
    updated_at: Date;
  };
  transactions: {
    id: string;
    book_id: string;
    account_id: string | null;
    destination_account_id: string | null;
  };
  authorized_senders: {
    id: string;
    channel: string;
    sender_reference: string;
    name: string;
    default_book_id: string | null;
    default_account_id: string | null;
    active: boolean;
    created_at: Date;
    updated_at: Date;
  };
  categories: {
    id: string;
  };
  merchants: {
    id: string;
  };
  classification_rules: {
    id: string;
  };
}
