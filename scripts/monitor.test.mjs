import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isServiceTime, monitor } from './monitor.mjs';

const daytime = () => new Date('2026-09-10T10:00:00Z');

test('service window follows Madrid time in winter and summer', () => {
  for (const [date, offset] of [['2026-01-10', 1], ['2026-07-10', 2]]) {
    for (const [hour, minute, expected] of [[6, 44, false], [6, 45, true], [22, 29, true], [22, 30, false]]) {
      const utc = `${date}T${String(hour - offset).padStart(2, '0')}:${minute}:00Z`;
      assert.equal(isServiceTime(new Date(utc)), expected, utc);
    }
  }
});

test('monitor catches widespread empty arrivals, retries, diagnoses, and respects closing time', async (t) => {
  let rounds = 0;
  let waits = 0;
  let state = 'empty';
  let upstream = '<table class="tablePanel"><tr><td>1</td><td>Destination</td><td>5min</td></tr></table>';
  const logs = [];
  t.mock.method(console, 'log', (line) => logs.push(JSON.parse(line)));
  t.mock.method(globalThis, 'fetch', async (url) => {
    const path = new URL(url).pathname;
    if (path.endsWith('panel.aspx')) {
      if (state === 'upstream-down') throw new Error('connection failed');
      return new Response(upstream);
    }
    if (path === '/lines') {
      rounds++;
      if (state === 'missing-line') return Response.json([{ id: 1, internalId: 21 }]);
      if (state === 'empty-lines') return Response.json([]);
      return Response.json([{ id: 1, internalId: 21 }, { id: 2, internalId: 22 }]);
    }
    if (path.endsWith('/routes')) return Response.json([{ id: 1 }]);
    if (path.endsWith('/stops')) return Response.json([{ code: 2101 }, { code: 2102 }]);
    if (state === 'http-error') return new Response('unavailable', { status: 503 });
    if (state === 'invalid') return Response.json({ error: 'unexpected response' });
    if (state === 'healthy' || (state === 'recover' && rounds > 1) || (state === 'partial' && path.includes('/2102/'))) {
      return Response.json([{ line: 1, destination: '', arrival: '>>' }]);
    }
    return Response.json([]);
  });
  const options = { now: daytime, sleep: async (ms) => { assert.equal(ms, 60_000); waits++; } };
  assert.equal(await monitor(options), 1);
  assert.equal(rounds, 3);
  assert.equal(waits, 2);
  assert.ok(logs.some((r) => r.kind === 'upstream-rows-present'));

  upstream = '<table class="tablePanel"></table>';
  logs.length = 0;
  assert.equal(await monitor(options), 1);
  assert.ok(logs.some((r) => r.kind === 'upstream-empty'));
  upstream = '<html>Maintenance</html>';
  logs.length = 0;
  assert.equal(await monitor(options), 1);
  assert.ok(logs.some((r) => r.kind === 'upstream-markup-missing'));

  for (const failure of ['http-error', 'invalid', 'missing-line', 'empty-lines', 'upstream-down']) {
    state = failure;
    assert.equal(await monitor(options), 1);
  }
  assert.ok(logs.some((r) => r.kind === 'upstream-request-failed'));
  for (const success of ['healthy', 'partial', 'recover']) {
    state = success;
    rounds = waits = 0;
    assert.equal(await monitor(options), 0);
    assert.equal(rounds, success === 'recover' ? 2 : 1);
  }
  rounds = 0;
  assert.equal(await monitor({ ...options, now: () => new Date('2026-09-10T21:00:00Z') }), 0);
  assert.equal(rounds, 0);
  state = 'empty';
  let calls = 0;
  rounds = 0;
  assert.equal(await monitor({ ...options, now: () => ++calls === 1 ? daytime() : new Date('2026-09-10T21:00:00Z') }), 0);
  assert.equal(rounds, 1);
});
