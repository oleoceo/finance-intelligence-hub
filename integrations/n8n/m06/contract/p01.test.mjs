import test from 'node:test';
import assert from 'node:assert/strict';

// Synthetic contract harness only. No Evolution payload shape or runtime workflow is implied.
const instance = 'synthetic-instance-a';
const verified = new WeakSet();
const authenticate = (event, evidence) => {
  if (evidence === 'isolated-test-verifier' && event.instance === instance) verified.add(event);
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
const validTime = (value) =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
  !Number.isNaN(Date.parse(value));
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
  if (
    !verified.has(event) ||
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
