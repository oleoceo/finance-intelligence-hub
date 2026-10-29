import { timingSafeEqual } from 'node:crypto';
import { processEventWithReply } from '../p03/processor.mjs';
import { transportStatus } from '../p02/processor.mjs';

const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const only = (v, keys) => object(v) && Object.keys(v).every((k) => keys.includes(k));
const phone = (v) => typeof v === 'string' && /^\d{8,20}@s\.whatsapp\.net$/.test(v);
const secret = (v) => typeof v === 'string' && v.length >= 32 && v.length <= 512;

export function authenticate(headers, expected) {
  const supplied = headers?.['x-finance-webhook'];
  return (
    secret(expected) &&
    typeof supplied === 'string' &&
    Buffer.byteLength(supplied) === Buffer.byteLength(expected) &&
    timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  );
}

// Called only after header authentication. Payload apikey/sender never authenticate a request.
export function mapEvolution(body, config) {
  if (
    !only(body, [
      'event',
      'instance',
      'data',
      'destination',
      'date_time',
      'sender',
      'server_url',
      'apikey',
    ]) ||
    body.event !== 'messages.upsert' ||
    body.instance !== config.instance ||
    !phone(config.ownerJid) ||
    body.sender !== config.ownerJid
  )
    return null;
  const data = body.data;
  if (
    !only(data, [
      'key',
      'pushName',
      'status',
      'message',
      'contextInfo',
      'messageType',
      'messageTimestamp',
      'instanceId',
      'source',
    ]) ||
    !config.instanceId ||
    data.instanceId !== config.instanceId ||
    data.messageType !== 'conversation' ||
    !only(data.message, ['conversation', 'messageContextInfo']) ||
    typeof data.message.conversation !== 'string'
  )
    return null;
  const key = data.key;
  if (
    !only(key, [
      'id',
      'remoteJid',
      'remoteJidAlt',
      'fromMe',
      'participant',
      'participantAlt',
      'addressingMode',
    ]) ||
    key.fromMe !== false ||
    !phone(key.remoteJid) ||
    typeof key.id !== 'string' ||
    !/^[A-Za-z0-9_-]{1,255}$/.test(key.id) ||
    (key.remoteJidAlt != null && key.remoteJidAlt !== key.remoteJid) ||
    (key.participant != null && key.participant !== '') ||
    (key.participantAlt != null && key.participantAlt !== '') ||
    (key.addressingMode != null && key.addressingMode !== 'pn')
  )
    return null;
  if (
    !Number.isSafeInteger(data.messageTimestamp) ||
    data.messageTimestamp <= 0 ||
    data.messageTimestamp > 253402300799
  )
    return null;
  const sender = key.remoteJid.slice(0, -15);
  return Object.freeze({
    instance: config.instance,
    messageId: key.id,
    sender,
    corroboratingSender: sender,
    receivedAt: new Date(data.messageTimestamp * 1000).toISOString(),
    text: data.message.conversation,
    kind: 'message',
    contentKind: 'text',
    isGroup: false,
    fromMe: false,
  });
}

export async function runLive(input, config, credentials, request, wait) {
  // Disabled independently of workflow activation. No credentials/body in result or thrown errors.
  if (config.enabled !== true) return { stage: 'disabled' };
  if (!authenticate(input?.headers, credentials.webhook)) return { stage: 'rejected' };
  if (
    ![credentials.finance, credentials.evolution].every(secret) ||
    new Set(Object.values(credentials)).size !== 3
  )
    return { stage: 'configuration_rejected' };
  let base;
  try {
    base = new URL(config.evolutionUrl);
    if (
      base.protocol !== 'https:' ||
      base.username ||
      base.password ||
      base.search ||
      base.hash ||
      base.pathname !== '/' ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(config.instance)
    )
      return { stage: 'configuration_rejected' };
  } catch {
    return { stage: 'configuration_rejected' };
  }
  const event = mapEvolution(input.body, config);
  if (!event) return { stage: 'rejected' };
  const post = async (url, headers, body) => {
    try {
      const response = await request({
        method: 'POST',
        url,
        headers,
        body,
        json: true,
        timeout: 10000,
        disableFollowRedirect: true,
        returnFullResponse: true,
        ignoreHttpStatusErrors: true,
      });
      return {
        status: response.statusCode,
        body: response.body,
        retryAfter: response.headers?.['retry-after'],
      };
    } catch (error) {
      return { status: error?.code === 'ECONNABORTED' ? 'timeout' : transportStatus(error) };
    }
  };
  return processEventWithReply(event, {
    verify: async () => ({ ...event }),
    configuredInstance: config.instance,
    finance: (envelope) =>
      post(
        'http://finance-lab-api:3000/api/v1/inbox/messages',
        { Authorization: `Bearer ${credentials.finance}` },
        envelope,
      ),
    send: ({ recipient, text }) =>
      post(
        `${base.origin}/message/sendText/${encodeURIComponent(config.instance)}`,
        { apikey: credentials.evolution },
        { number: recipient, text, linkPreview: false },
      ),
    wait,
  });
}
