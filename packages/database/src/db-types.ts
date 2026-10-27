/**
 * Shared database type definitions for Kysely integration.
 *
 * This file centralizes the DB schema types used across all database adapters
 * to ensure type consistency and avoid incompatible Transaction/Kysely types.
 */

export interface DB {
  confirmation_sessions: {
    id: string;
    channel: string;
    sender_reference: string;
    authorized_sender_id: string;
    inbox_message_id: string;
    resolved_by_inbox_message_id: string | null;
    action: string;
    target_entity_type: string | null;
    target_entity_id: string | null;
    target_version: number | null;
    payload: Record<string, unknown>;
    status: string;
    resolution_reason: string | null;
    expires_at: Date;
    created_at: Date;
    resolved_at: Date | null;
  };
  inbox_messages: {
    id: string;
    source: string;
    source_instance: string;
    source_message_id: string;
    sender_reference: string;
    authorized_sender_id: string;
    raw_text: string;
    raw_payload: Record<string, unknown> | null;
    received_at: Date;
    processing_status: string;
    attempt_count: number;
    processing_started_at: Date | null;
    last_attempt_at: Date | null;
    processed_at: Date | null;
    correlation_id: string;
    failure_code: string | null;
    failure_message: string | null;
    created_at: Date;
    updated_at: Date;
  };
  audit_events: {
    id: string;
    entity_type: string;
    entity_id: string;
    action: string;
    source: string;
    actor_reference: string | null;
    old_data: Record<string, unknown> | null;
    new_data: Record<string, unknown> | null;
    correlation_id: string | null;
    created_at: Date;
  };
  idempotency_keys: {
    id: string;
    scope: string;
    idempotency_key: string;
    request_hash: string;
    status: string;
    resource_type: string | null;
    resource_id: string | null;
    response_status: number | null;
    response_body: Record<string, unknown> | null;
    created_at: Date;
    completed_at: Date | null;
  };
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
  categories: {
    id: string;
    book_id: string;
    name: string;
    normalized_name: string;
    parent_category_id: string | null;
    type: string;
    active: boolean;
    archived_at: Date | null;
    created_at: Date;
    updated_at: Date;
  };
  merchants: {
    id: string;
    name: string;
    normalized_name: string;
    type: string | null;
    tax_identifier: string | null;
    active: boolean;
    archived_at: Date | null;
    created_at: Date;
    updated_at: Date;
  };
  transactions: {
    id: string;
    human_ref: string;
    book_id: string;
    account_id: string;
    destination_account_id: string | null;
    category_id: string | null;
    merchant_id: string | null;
    type: string;
    status: string;
    amount: string;
    currency: string;
    description: string;
    notes: string | null;
    transaction_date: string;
    source: string;
    source_reference: string | null;
    inbox_message_id: string | null;
    refund_of_transaction_id: string | null;
    version: number;
    voided_at: Date | null;
    void_reason: string | null;
    created_at: Date;
    updated_at: Date;
  };
  classification_rules: {
    id: string;
    priority: number;
    active: boolean;
    match_type: string;
    pattern: string;
    normalized_pattern: string;
    target_book_id: string | null;
    target_account_id: string | null;
    target_category_id: string | null;
    target_merchant_id: string | null;
    source: string;
    created_at: Date;
    updated_at: Date;
  };
  authorized_senders: {
    id: string;
    channel: string;
    sender_reference: string;
    name: string | null;
    default_book_id: string | null;
    default_account_id: string | null;
    active: boolean;
    created_at: Date;
    updated_at: Date;
  };
}
