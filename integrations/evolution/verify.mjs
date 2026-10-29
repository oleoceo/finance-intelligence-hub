import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = process.argv[2];
assert.ok(root, 'pass the patched Evolution source directory');
const baileys = readFileSync(
  join(root, 'src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts'),
  'utf8',
);
const webhook = readFileSync(
  join(root, 'src/api/integrations/event/webhook/webhook.controller.ts'),
  'utf8',
);

test('incoming Baileys message reaches webhook without raw console or verbose logging', () => {
  const start = baileys.indexOf('sendTelemetry(`received.message.');
  const end = baileys.indexOf('this.sendDataWebhook(Events.MESSAGES_UPSERT, messageRaw)', start);
  assert.ok(start > 0 && end > start);
  const path = baileys.slice(start - 100, end);
  assert.doesNotMatch(path, /console\.|logger\.|JSON\.stringify\(messageRaw\)/);
  assert.match(baileys.slice(end, end + 300), /chatbotController\.emit/);
  for (const rawLog of [
    "console.log('CB:call', packet)",
    "console.log('CB:ack,class:call', packet)",
    "console.log('received on-demand history sync, messages=', messages)",
    "console.log('Message received from phone, id=', requestId, received)",
    "console.log('stanza', JSON.stringify(stanza))",
    'this.logger.verbose(`Update messages ${JSON.stringify(args, undefined, 2)}`)',
    'JSON.stringify(received, null, 2)',
  ]) {
    assert.ok(!baileys.includes(rawLog), `raw Baileys log remains: ${rawLog}`);
  }
});

test('webhook keeps delivery payload and credential while logging metadata only', () => {
  assert.match(webhook, /const webhookData = \{[\s\S]*?data,[\s\S]*?apikey: apiKey,/);
  assert.match(webhook, /headers: webhookHeaders as Record<string, string> \| undefined/);
  assert.match(webhook, /await this\.retryWebhookRequest\(httpService, webhookData/);
  const synthetic = {
    message: 'SYNTHETIC_MESSAGE_BODY_842',
    token: 'SYNTHETIC_APIKEY_842',
    header: 'SYNTHETIC_HEADER_842',
    url: 'https://example.invalid/SYNTHETIC_HEADER_842',
  };
  const logCalls = [
    ...[...webhook.matchAll(/this\.logger\.(?:log|error)\(\{([\s\S]*?)\}\);/g)].map((m) => m[1]),
    ...[...webhook.matchAll(/const logData = \{([\s\S]*?)\};/g)].map((m) => m[1]),
  ];
  assert.ok(logCalls.length >= 6);
  for (const fields of logCalls) {
    assert.doesNotMatch(
      fields,
      /\.\.\.webhookData|\bdata\b|apikey|headers|error\?\.message|error\?\.stack|\bstack\b|\burl\b|server_url|baseURL|globalURL/,
    );
    // Evaluate the actual log fields with synthetic request values and errors.
    const render = new Function(
      'origin',
      'event',
      'instanceName',
      'attempts',
      'maxRetryAttempts',
      'isTimeout',
      'error',
      'nextDelay',
      `return ({${fields}})`,
    );
    const output = JSON.stringify(
      render(
        'webhook',
        'messages.upsert',
        'lab',
        1,
        3,
        false,
        {
          message: synthetic.message,
          stack: synthetic.token,
          response: { status: 503, data: synthetic.header },
        },
        1,
      ),
    );
    for (const secret of Object.values(synthetic))
      assert.ok(!output.includes(secret), 'sensitive value in log');
  }
});
