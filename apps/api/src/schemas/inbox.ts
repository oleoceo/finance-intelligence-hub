import { Type } from '@fastify/type-provider-typebox';
import { strict } from './configuration.js';

export const inboxMessageSchema = strict({
  source: Type.Literal('whatsapp'),
  source_instance: Type.String({ minLength: 1, maxLength: 255 }),
  source_message_id: Type.String({ minLength: 1, maxLength: 255 }),
  sender_reference: Type.String({ minLength: 1, maxLength: 255 }),
  received_at: Type.String({ format: 'date-time' }),
  raw_text: Type.String(),
  message_context: strict({ is_group: Type.Boolean(), from_me: Type.Boolean() }),
});
