import { interpretMessage } from './interpret-message.js';
import type {
  ConfirmationOwner,
  ConfirmationResolution,
  ConfirmationSessionRepository,
  NewConfirmationSession,
} from '../ports/confirmation-ports.js';

export async function openConfirmation(
  repository: ConfirmationSessionRepository,
  input: NewConfirmationSession,
) {
  return repository.create(input);
}

export async function resolveContextualReply(
  repository: ConfirmationSessionRepository,
  input: ConfirmationOwner & { rawText: string; resolverInboxMessageId: string; now: Date },
): Promise<ConfirmationResolution> {
  const interpretation = interpretMessage({ rawText: input.rawText });
  if (interpretation.kind !== 'reply') return { kind: 'none' };
  return repository.resolveReply({
    channel: input.channel,
    senderReference: input.senderReference,
    authorizedSenderId: input.authorizedSenderId,
    resolverInboxMessageId: input.resolverInboxMessageId,
    now: input.now,
    reply: interpretation.response,
  });
}
