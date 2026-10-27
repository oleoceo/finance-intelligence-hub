import type { Kysely } from 'kysely';
import type { Interpretation } from '@finance-hub/core';
import type { DB } from '../db-types.js';

/** One deterministic parsing record per fenced Inbox attempt. */
export class KyselyInterpretationRepository {
  constructor(private readonly db: Kysely<DB>) {}

  async create(input: {
    id: string;
    inboxMessageId: string;
    attemptNumber: number;
    interpretation: Interpretation;
    now: Date;
  }): Promise<void> {
    await this.db
      .insertInto('interpretations')
      .values({
        id: input.id,
        inbox_message_id: input.inboxMessageId,
        attempt_number: input.attemptNumber,
        intent: input.interpretation.kind,
        confidence: null,
        parsed_data: input.interpretation as unknown as Record<string, unknown>,
        parser_type: 'deterministic',
        parser_version: 'm05-p02',
        ai_provider: null,
        ai_model: null,
        prompt_version: null,
        status: 'completed',
        created_at: input.now,
      })
      .execute();
  }
}
