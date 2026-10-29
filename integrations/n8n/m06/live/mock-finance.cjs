// Only used inside the network-disabled runtime test container.
const http = require('node:http');
const { readFileSync, writeFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const dir = process.argv[2];
const creds = JSON.parse(readFileSync(`${dir}/credentials.json`, 'utf8'));
let calls = 0;
http
  .createServer((req, res) => {
    let text = '';
    req.on('data', (chunk) => (text += chunk));
    req.on('end', () => {
      try {
        assert.equal(req.url, '/api/v1/inbox/messages');
        assert.equal(req.method, 'POST');
        assert.equal(req.headers.authorization, `Bearer ${creds[1].data.token}`);
        const body = JSON.parse(text);
        assert.equal(body.source_message_id, 'SYNTHETIC123');
        assert.equal(body.sender_reference, '5511999999999');
        assert.equal(body.raw_text, 'último');
        calls++;
        writeFileSync(`${dir}/calls.json`, JSON.stringify({ calls }));
        res.writeHead(calls === 1 ? 503 : 200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            data: { result: { type: 'duplicate_message' }, reply: { should_send: false } },
          }),
        );
      } catch {
        res.writeHead(422);
        res.end('{}');
      }
    });
  })
  .listen(3000, '127.0.0.1', () => process.send('ready'));
