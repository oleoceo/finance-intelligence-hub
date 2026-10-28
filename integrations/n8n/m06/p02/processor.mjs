// Provider-neutral workflow logic. A trusted ingress adapter must supply verify;
// the importable template supplies a fail-closed adapter until Gate 0.
const fields = [
  'instance',
  'messageId',
  'sender',
  'corroboratingSender',
  'receivedAt',
  'text',
  'kind',
  'contentKind',
  'isGroup',
  'fromMe',
];
const bounded = (value) => typeof value === 'string' && value.length > 0 && value.length <= 255;

export function validTime(value) {
  if (typeof value !== 'string') return false;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/.exec(
      value,
    );
  if (!match) return false;
  const [, year, month, day, hour, minute, second, zone, , offsetHour, offsetMinute] = match;
  const y = Number(year),
    m = Number(month),
    d = Number(day);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return (
    m >= 1 &&
    m <= 12 &&
    d >= 1 &&
    d <= days[m - 1] &&
    Number(hour) <= 23 &&
    Number(minute) <= 59 &&
    Number(second) <= 59 &&
    (zone === 'Z' || (Number(offsetHour) <= 23 && Number(offsetMinute) <= 59)) &&
    !Number.isNaN(Date.parse(value))
  );
}

export function normalize(event, verified, configuredInstance) {
  if (
    !verified ||
    !event ||
    typeof event !== 'object' ||
    Array.isArray(event) ||
    Object.keys(event).sort().join() !== [...fields].sort().join() ||
    Object.keys(verified).sort().join() !== [...fields].sort().join() ||
    fields.some((field) => !Object.is(event[field], verified[field])) ||
    !bounded(configuredInstance) ||
    event.instance !== configuredInstance ||
    event.kind !== 'message' ||
    event.contentKind !== 'text' ||
    event.isGroup !== false ||
    event.fromMe !== false ||
    !bounded(event.messageId) ||
    !bounded(event.sender) ||
    !/^\d{8,20}$/.test(event.sender) ||
    event.sender !== event.corroboratingSender ||
    !validTime(event.receivedAt) ||
    typeof event.text !== 'string'
  )
    return null;
  return {
    source: 'whatsapp',
    source_instance: configuredInstance,
    source_message_id: event.messageId,
    sender_reference: event.sender,
    received_at: event.receivedAt,
    raw_text: event.text,
    message_context: { is_group: false, from_me: false },
  };
}

export function retryDecision(status, retryAfter, attempt) {
  if (attempt >= 3) return { retry: false, delayMs: 0 };
  if (status === 429) {
    const seconds = Number(retryAfter);
    return {
      retry: true,
      delayMs: Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds * 1000, 30000) : 30000,
    };
  }
  if (status === 500 || status === 503 || status === 'timeout')
    return { retry: true, delayMs: Math.min(1000 * 2 ** (attempt - 1), 4000) };
  return { retry: false, delayMs: 0 };
}

export async function processEvent(
  event,
  { verify = async () => null, configuredInstance, finance, wait = async () => {} },
) {
  const verified = await verify(event);
  const envelope = normalize(event, verified, configuredInstance);
  if (!envelope) return { stage: 'rejected', reason: 'INGRESS_REJECTED' };
  for (let attempt = 1; attempt <= 3; attempt++) {
    let response;
    try {
      response = await finance(envelope);
    } catch {
      response = { status: 'timeout' };
    }
    if (response.status >= 200 && response.status < 300)
      return { stage: 'accepted', status: response.status };
    const decision = retryDecision(response.status, response.retryAfter, attempt);
    if (!decision.retry)
      return { stage: 'failed', status: response.status, reason: 'FINANCE_INGEST_FAILED' };
    await wait(decision.delayMs);
  }
}
