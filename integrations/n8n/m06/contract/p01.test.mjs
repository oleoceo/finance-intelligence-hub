import test from 'node:test';
import assert from 'node:assert/strict';

// Synthetic contract harness only. No Evolution payload shape or runtime workflow is implied.
const instance = 'synthetic-instance-a';
const verified = new WeakMap();
const authenticate = (event, evidence) => {
  if (evidence === 'isolated-test-verifier' && event.instance === instance)
    verified.set(event, Object.freeze({ ...event }));
  return event;
};
const base = () => ({
  instance,
  messageId: 'synthetic-message-1',
  sender: '00000000000',
  corroboratingSender: '00000000000',
  receivedAt: '2026-01-01T12:00:00Z',
  text: 'synthetic text',
  kind: 'message',
  contentKind: 'text',
  isGroup: false,
  fromMe: false,
});
const keys = [
  'source',
  'source_instance',
  'source_message_id',
  'sender_reference',
  'received_at',
  'raw_text',
  'message_context',
];
function validTime(value) {
  if (typeof value !== 'string') return false;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/.exec(
      value,
    );
  if (!match) return false;
  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    zone,
    ,
    offsetHourText,
    offsetMinuteText,
  ] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth[month - 1] &&
    Number(hourText) <= 23 &&
    Number(minuteText) <= 59 &&
    Number(secondText) <= 59 &&
    (zone === 'Z' || (Number(offsetHourText) <= 23 && Number(offsetMinuteText) <= 59)) &&
    !Number.isNaN(Date.parse(value))
  );
}
const bounded = (value) => typeof value === 'string' && value.length >= 1 && value.length <= 255;
function validateEnvelope(value) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join() === [...keys].sort().join() &&
    value.source === 'whatsapp' &&
    bounded(value.source_instance) &&
    bounded(value.source_message_id) &&
    bounded(value.sender_reference) &&
    validTime(value.received_at) &&
    typeof value.raw_text === 'string' &&
    value.message_context &&
    typeof value.message_context === 'object' &&
    Object.keys(value.message_context).sort().join() === 'from_me,is_group' &&
    typeof value.message_context.is_group === 'boolean' &&
    typeof value.message_context.from_me === 'boolean'
  );
}
function normalize(event) {
  const attestation = verified.get(event);
  if (
    !attestation ||
    Object.keys(event).length !== Object.keys(attestation).length ||
    Object.keys(attestation).some((key) => !Object.is(event[key], attestation[key])) ||
    event.instance !== instance ||
    event.kind !== 'message' ||
    event.contentKind !== 'text' ||
    event.isGroup !== false ||
    event.fromMe !== false ||
    !bounded(event.messageId) ||
    !bounded(event.sender) ||
    !/^\d{8,20}$/.test(event.sender) ||
    event.sender !== event.corroboratingSender ||
    !validTime(event.receivedAt) ||
    typeof event.text !== 'string' ||
    Object.keys(event).sort().join() !== Object.keys(base()).sort().join()
  )
    return null;
  const envelope = {
    source: 'whatsapp',
    source_instance: event.instance,
    source_message_id: event.messageId,
    sender_reference: event.sender,
    received_at: event.receivedAt,
    raw_text: event.text,
    message_context: { is_group: event.isGroup, from_me: event.fromMe },
  };
  return validateEnvelope(envelope) ? envelope : null;
}
function deliver(event, calls) {
  const envelope = normalize(event);
  if (envelope) calls.push(envelope);
  return envelope;
}

test('trusted private text maps to exact M05 envelope and stable replay identity', () => {
  const calls = [];
  const event = authenticate(base(), 'isolated-test-verifier');
  const first = deliver(event, calls);
  const replay = deliver(event, calls);
  assert.equal(calls.length, 2);
  assert.deepEqual(first, replay);
  assert.deepEqual(first, {
    source: 'whatsapp',
    source_instance: instance,
    source_message_id: 'synthetic-message-1',
    sender_reference: '00000000000',
    received_at: '2026-01-01T12:00:00Z',
    raw_text: 'synthetic text',
    message_context: { is_group: false, from_me: false },
  });
});

const rejected = [
  ['untrusted origin', {}, false],
  ['payload trust claim', { trusted: true }, false],
  ['forged authorized-looking sender', { sender: '00000000000' }, false],
  ['wrong instance', { instance: 'synthetic-instance-b' }, true],
  ['missing message ID', { messageId: undefined }, true],
  ['missing sender', { sender: undefined }, true],
  ['malformed sender', { sender: 'not-a-phone', corroboratingSender: 'not-a-phone' }, true],
  ['conflicting sender', { corroboratingSender: '11111111111' }, true],
  ['invalid timestamp', { receivedAt: 'not-a-date' }, true],
  ['timezone-free timestamp', { receivedAt: '2026-01-01T12:00:00' }, true],
  ['impossible February 30', { receivedAt: '2026-02-30T12:00:00Z' }, true],
  ['non-leap February 29', { receivedAt: '2026-02-29T12:00:00Z' }, true],
  ['leap-year February 30', { receivedAt: '2024-02-30T12:00:00Z' }, true],
  ['April 31', { receivedAt: '2026-04-31T12:00:00Z' }, true],
  ['invalid offset hour', { receivedAt: '2026-01-01T12:00:00+24:00' }, true],
  ['invalid offset minute', { receivedAt: '2026-01-01T12:00:00-03:60' }, true],
  ['malformed offset', { receivedAt: '2026-01-01T12:00:00+3:00' }, true],
  ['group', { isGroup: true }, true],
  ['from_me', { fromMe: true }, true],
  ['status update', { kind: 'status' }, true],
  ['non-message event', { kind: 'connection' }, true],
  ['non-text event', { contentKind: 'image' }, true],
  ['missing text', { text: undefined }, true],
  ['unknown security metadata', { senderAlias: '00000000000' }, true],
];
for (const [name, override, trust] of rejected)
  test(`${name}: zero Finance forwarding`, () => {
    const calls = [];
    const event = { ...base(), ...override };
    if (trust) authenticate(event, 'isolated-test-verifier');
    assert.equal(deliver(event, calls), null);
    assert.equal(calls.length, 0);
  });

const tampered = [
  [
    'sender and corroborating sender',
    { sender: '11111111111', corroboratingSender: '11111111111' },
  ],
  ['provider message ID', { messageId: 'synthetic-message-2' }],
  ['instance identity', { instance: 'synthetic-instance-b' }],
  ['event type', { kind: 'status' }],
  ['security-relevant direction', { fromMe: true }],
  ['security-relevant metadata', { senderAlias: '11111111111' }],
];
for (const [name, override] of tampered)
  test(`post-verification ${name} tampering: zero Finance forwarding`, () => {
    const calls = [];
    const event = authenticate(base(), 'isolated-test-verifier');
    Object.assign(event, override);
    assert.equal(deliver(event, calls), null);
    assert.equal(calls.length, 0);
  });

for (const timestamp of [
  '2024-02-29T12:00:00Z',
  '2026-01-01T12:00:00-03:00',
  '2026-01-01T12:00:00.123+05:30',
])
  test(`valid timezone-qualified timestamp ${timestamp} is preserved`, () => {
    const calls = [];
    const event = authenticate({ ...base(), receivedAt: timestamp }, 'isolated-test-verifier');
    assert.equal(deliver(event, calls).received_at, timestamp);
    assert.equal(calls.length, 1);
  });

test('strict envelope rejects missing, wrong-type and extra fields', () => {
  const envelope = deliver(authenticate(base(), 'isolated-test-verifier'), []);
  for (const field of keys) {
    const missing = { ...envelope };
    delete missing[field];
    assert.equal(validateEnvelope(missing), false, field);
  }
  assert.equal(validateEnvelope({ ...envelope, extra: true }), false);
  assert.equal(
    validateEnvelope({
      ...envelope,
      message_context: { ...envelope.message_context, extra: true },
    }),
    false,
  );
  assert.equal(
    validateEnvelope({ ...envelope, message_context: { is_group: 'false', from_me: false } }),
    false,
  );
  assert.equal(validateEnvelope({ ...envelope, source_message_id: 1 }), false);
  assert.equal(validateEnvelope({ ...envelope, received_at: '2026-01-01T12:00:00' }), false);
});
