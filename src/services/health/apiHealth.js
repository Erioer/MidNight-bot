// apiHealth.js
// Live dependency health checks for the system status dashboard.
//
// Every check is a small, side-effect-free GET with a short timeout, run in
// parallel so one slow API cannot stall the board. A check counts as
// operational on any 2xx response — this measures reachability, not content
// correctness. spoo.me is probed via robots.txt on purpose: the create endpoint
// would mint a junk short link on every dashboard open, and its homepage is far
// too large for the 64KB response cap.

import axios from 'axios';
import { BOT_USER_AGENT } from '../../config/bot.js';

const CHECK_TIMEOUT_MS = 6000;

// Every entry uses the same `Label (\`host\`)` shape and the board renders one
// flat list — mixing in bare slugs or splitting it into sub-groups read as
// inconsistent next to the surrounding stat lines.
const ENDPOINTS = [
  {
    name: 'Weather (`open-meteo`)',
    url: 'https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41&current=temperature_2m',
  },
  {
    name: 'Weather Geocoding (`open-meteo`)',
    url: 'https://geocoding-api.open-meteo.com/v1/search?name=Berlin&count=1',
  },
  {
    name: 'URL Shortener (`spoo.me`)',
    // robots.txt, not the homepage: spoo.me's homepage is a ~340KB Next.js page
    // that trips the 64KB maxContentLength cap below and reports a false outage.
    // Its official status page is https://status.spoo.me
    url: 'https://spoo.me/robots.txt',
  },
  {
    name: 'Anime Media (`nekos.best`)',
    url: 'https://nekos.best/api/v2/hug?amount=1',
  },
  {
    name: 'Hex Color Previews (`dummyimage.com`)',
    url: 'https://dummyimage.com/100x100/2ecc71/2ecc71.png',
  },
  {
    name: 'Wikipedia (`wikipedia.org`)',
    url: 'https://en.wikipedia.org/w/api.php?action=opensearch&search=cat&limit=1&namespace=0&format=json',
  },
  {
    name: 'DuckDuckGo (`duckduckgo`)',
    url: 'https://api.duckduckgo.com/?q=test&format=json&no_html=1&skip_disambig=1',
  },
  {
    name: 'Urban Dictionary (`urbandictionary`)',
    url: 'https://api.urbandictionary.com/v0/define?term=test',
  },
  {
    name: 'Cat Facts (`meowfacts`)',
    url: 'https://meowfacts.herokuapp.com/',
  },
  {
    name: 'Dog Facts (`dogapi.dog`)',
    url: 'https://dogapi.dog/api/v2/facts?limit=1',
  },
  {
    name: 'Random Facts (`uselessfacts`)',
    url: 'https://uselessfacts.jsph.pl/api/v2/facts/random?language=en',
  },
];

export const HEALTH_SECTION_TITLE = 'External API & Integration Health';

async function checkEndpoint({ name, url }) {
  const startedAt = Date.now();
  try {
    const response = await axios.get(url, {
      timeout: CHECK_TIMEOUT_MS,
      headers: { 'User-Agent': BOT_USER_AGENT },
      maxContentLength: 64 * 1024,
    });
    const ok = response.status >= 200 && response.status < 300;
    return { name, ok, ms: Date.now() - startedAt };
  } catch {
    return { name, ok: false, ms: Date.now() - startedAt };
  }
}

/** Runs every check in parallel. Never throws — failures become `ok: false`. */
export async function checkApiHealth() {
  return Promise.all(ENDPOINTS.map((endpoint) => checkEndpoint(endpoint)));
}

/** Overall board status from a result list. Pure. */
export function getOverallStatus(results) {
  const total = results.length;
  const up = results.filter((r) => r.ok).length;
  if (total > 0 && up === total) return { level: 'up', line: '🟢 All Systems Operational' };
  if (up > 0) return { level: 'degraded', line: '🟡 Partial Outage — some services not responding' };
  return { level: 'down', line: '🔴 All external APIs are not responding' };
}

/** One result line. Pure. Status dots read at a glance, per the house rule. */
export function formatHealthLine({ name, ok, ms }) {
  return ok
    ? `• **${name}:** 🟢 Operational (\`${ms}ms\`)`
    : `• **${name}:** 🔴 Down`;
}
