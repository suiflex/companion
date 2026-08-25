// Proves the built bin actually starts under plain `node` and answers over
// stdio — the one thing the unit tests (which import src/tools.ts through
// vitest's resolver) cannot catch. Run after `npm run build -w @meetcc/mcp`.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));

const child = spawn('node', [here('./dist/server.js'), here('./smoke.snapshot.json')], {
  stdio: ['pipe', 'pipe', 'inherit'],
});

const requests = [
  { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '1' } } },
  { jsonrpc: '2.0', method: 'notifications/initialized' },
  { jsonrpc: '2.0', id: 2, method: 'tools/list' },
  { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_meetings', arguments: {} } },
];
child.stdin.write(requests.map((r) => JSON.stringify(r)).join('\n') + '\n');

let out = '';
child.stdout.on('data', (chunk) => {
  out += chunk;
  if (!out.includes('"id":3')) return;
  child.kill();

  const byId = new Map(
    out
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .map((msg) => [msg.id, msg]),
  );
  const fail = (why) => {
    console.error(`MCP smoke test failed: ${why}\n${out}`);
    process.exit(1);
  };

  if (byId.get(1)?.result?.serverInfo?.name !== 'companion') fail('initialize did not identify the server');
  if (byId.get(2)?.result?.tools?.length !== 9) fail('tools/list did not return the 9 documented tools');
  if (!byId.get(3)?.result?.content?.[0]?.text?.includes('Incident Freeport')) {
    fail('list_meetings did not read the snapshot');
  }
  console.log('MCP smoke test ok: initialize, tools/list (9), list_meetings');
});

setTimeout(() => {
  console.error(`MCP smoke test failed: no response in 20s\n${out}`);
  process.exit(1);
}, 20_000).unref();
