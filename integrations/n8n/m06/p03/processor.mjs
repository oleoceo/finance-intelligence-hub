import { normalize, retryDecision, transportStatus } from '../p02/processor.mjs';

const fail = (stage, status) => ({ stage, ...(status ? { status } : {}) });

function sendable(response) {
  const data = response?.body?.data;
  const reply = data?.reply;
  const type = data?.result?.type;
  if (['ignored', 'duplicate_message', 'processing', 'stale_claim'].includes(type))
    return reply?.should_send === false && reply.text === undefined ? null : undefined;
  if (
    ![
      'transaction_created',
      'query_last',
      'confirmation_required',
      'cancelled',
      'expired',
    ].includes(type)
  )
    return undefined;
  if (reply?.should_send === false && reply.text === undefined) return null;
  if (
    reply?.should_send === true &&
    typeof reply.text === 'string' &&
    reply.text.length > 0 &&
    [...reply.text].length <= 500 &&
    !/[\u0000-\u0009\u000b-\u001f\u007f\p{Cf}\p{Cs}]/u.test(reply.text)
  )
    return reply.text;
  return undefined;
}

/** The outbound loop only receives the immutable Finance reply; it never invokes ingest. */
export async function processEventWithReply(
  event,
  { verify = async () => null, configuredInstance, finance, send, wait, now = Date.now },
) {
  let verified;
  try {
    verified = await verify(event);
  } catch {
    return fail('rejected');
  }
  const envelope = normalize(event, verified, configuredInstance);
  if (!envelope) return fail('rejected');

  let financeResponse;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      financeResponse = await finance(envelope);
    } catch (error) {
      financeResponse = { status: transportStatus(error) };
    }
    const status = financeResponse?.status;
    if (Number.isInteger(status) && status >= 200 && status < 300) break;
    const decision = retryDecision(status, financeResponse?.retryAfter, attempt, now());
    if (!decision.retry) return fail('finance_failed', status);
    if (typeof wait !== 'function') return fail('finance_failed');
    try {
      await wait(decision.delayMs);
    } catch {
      return fail('finance_failed');
    }
  }
  const text = sendable(financeResponse);
  if (text === null) return fail('accepted_no_reply', financeResponse.status);
  if (text === undefined) return fail('invalid_finance_reply', financeResponse.status);

  let ambiguous = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    let response;
    try {
      response = await send({ recipient: envelope.sender_reference, text });
    } catch (error) {
      response = { status: transportStatus(error) };
    }
    const status = response?.status;
    if (Number.isInteger(status) && status >= 200 && status < 300)
      return { stage: 'sent', status, possiblyDeliveredEarlier: ambiguous };
    if (status === 'timeout') ambiguous = true;
    const decision = retryDecision(status, response?.retryAfter, attempt, now());
    if (!decision.retry) return { ...fail('send_failed', status), possiblyDelivered: ambiguous };
    if (typeof wait !== 'function') return { stage: 'send_failed', possiblyDelivered: ambiguous };
    try {
      await wait(decision.delayMs);
    } catch {
      return { stage: 'send_failed', possiblyDelivered: ambiguous };
    }
  }
}
