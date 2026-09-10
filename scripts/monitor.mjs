import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { load } from 'cheerio';

const base = process.env.API_BASE_URL || 'https://sanfernando-buses-api-production.up.railway.app';
const madrid = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function isServiceTime(date) {
  const time = madrid.format(date);
  return time >= '06:45' && time < '22:30';
}

function report(kind, detail = {}) {
  console.log(JSON.stringify({ time: new Date().toISOString(), kind, ...detail }));
}

async function get(url, json = true) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return json ? response.json() : response.text();
}

async function list(path) {
  const url = new URL(path, base).href;
  const rows = await get(url);
  if (!Array.isArray(rows) || rows.length === 0) throw new Error(`${url}: expected a nonempty list`);
  return rows;
}

function id(value) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Invalid ID in production response');
  return value;
}

async function sample(samples) {
  const lines = await list('/lines');
  for (const lineId of [1, 2]) {
    const line = lines.find((line) => line.id === lineId);
    if (!line) throw new Error(`Production is missing line ${lineId}`);
    const routes = await list(`/lines/${lineId}/routes`);
    const routeId = id(routes[0].id);
    const stops = await list(`/lines/${lineId}/routes/${routeId}/stops`);
    // ponytail: samples the first route only; expand if partial route outages matter.
    for (const stop of new Set([stops[0], stops[Math.floor(stops.length / 2)]])) {
      const stopCode = id(stop.code);
      samples.push({
        url: new URL(`/lines/${lineId}/routes/${routeId}/stops/${stopCode}/times`, base).href,
        upstream: `http://77.224.241.76/sanfernando/mobile/panel.aspx?stop=${stopCode}&route=${id(line.internalId)}${String(routeId).padStart(4, '0')}`,
      });
    }
  }
  const counts = await Promise.all(samples.map(async ({ url }) => {
    const arrivals = await get(url);
    if (!Array.isArray(arrivals) || arrivals.some((row) =>
      !row || !Number.isSafeInteger(row.line) || typeof row.arrival !== 'string' || !row.arrival.trim()
    )) throw new Error(`${url}: invalid arrivals response`);
    report('sample', { url, arrivals: arrivals.length });
    return arrivals.length;
  }));
  if (counts.every((count) => count === 0)) throw new Error('All sampled stops returned empty arrivals during service hours');
}

async function diagnose(samples) {
  for (const { upstream: url } of samples) {
    try {
      const $ = load(await get(url, false));
      const table = $('table.tablePanel');
      const rows = table.find('tr').filter((_, row) => $(row).find('td').length >= 3).length;
      report(!table.length ? 'upstream-markup-missing' : rows ? 'upstream-rows-present' : 'upstream-empty', { url, rows });
    } catch (error) {
      report('upstream-request-failed', { url, error: error.message });
    }
  }
}

export async function monitor({ now = () => new Date(), sleep = delay } = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (!isServiceTime(now())) {
      report('skip', { reason: 'Outside 06:45–22:30 Europe/Madrid' });
      return 0;
    }
    const samples = [];
    try {
      await sample(samples);
      report('pass', { attempt });
      return 0;
    } catch (error) {
      report('attempt-failed', { attempt, error: error.message });
      if (attempt === 3) {
        if (!isServiceTime(now())) {
          report('skip', { reason: 'Service window ended during the check' });
          return 0;
        }
        await diagnose(samples);
        report('fail', { attempts: attempt });
        return 1;
      }
      await sleep(60_000);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await monitor();
}
