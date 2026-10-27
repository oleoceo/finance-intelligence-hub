import { interpretMessage } from './interpret-message.js';
import type {
  ConfirmationOwner,
  ConfirmationResolution,
  ConfirmationResolverClaim,
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
  input: ConfirmationOwner & ConfirmationResolverClaim & { rawText: string; now: Date },
): Promise<ConfirmationResolution> {
  const interpretation = interpretMessage({ rawText: input.rawText });
  if (interpretation.kind !== 'reply') return { kind: 'none' };
  return repository.resolveReply({
    channel: input.channel,
    senderReference: input.senderReference,
    authorizedSenderId: input.authorizedSenderId,
    resolverInboxMessageId: input.resolverInboxMessageId,
    attemptCount: input.attemptCount,
    processingStartedAt: input.processingStartedAt,
    now: input.now,
    reply: interpretation.response,
  });
}
