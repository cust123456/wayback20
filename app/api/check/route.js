import { classifyTopics } from '../../../lib/topics';
import { isProxyEnabled, requestJson, requestText } from '../../../lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function normalizeDomain(input = '') {
  return input
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseStatusFromError(error) {
  const message = String(error?.message || error || '');
  const match = message.match(/HTTP\s*(\d{3})/i);
  if (match) {
    return Number(match[1]);
  }
  return 0;
}

function extractYear(timestamp) {
  if (!timestamp || String(timestamp).length < 4) return null;
  return String(timestamp).slice(0, 4);
}

function calcAge(firstYear) {
  const year = Number(firstYear);
  if (!year || Number.isNaN(year)) return null;
  const currentYear = new Date().getUTCFullYear();
  return Math.max(currentYear - year, 0);
}

function stripHtml(html = '') {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildArchivedUrl(timestamp, original, domain) {
  const target = original || domain;
  return `https://web.archive.org/web/${timestamp}if_/${target}`;
}

function pickSnapshots(rows) {
  const timestamps = rows.map((row) => row?.[0]).filter(Boolean);
  if (!timestamps.length) return [];

  const first = timestamps[0];
  const last = timestamps[timestamps.length - 1];
  const middle = timestamps[Math.floor((timestamps.length - 1) / 2)];

  return [...new Set([first, middle, last].filter(Boolean))];
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const rawDomain = searchParams.get('domain') || '';
  const rawProxy = searchParams.get('proxy') || '';
  const domain = normalizeDomain(rawDomain);
  const proxyOption = rawProxy ? { proxy: rawProxy } : {};

  if (!domain) {
    return Response.json({ error: 'Missing domain parameter' }, { status: 400 });
  }

  try {
    const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(
      domain
    )}&fl=timestamp,original,statuscode,mimetype&filter=statuscode:200&collapse=digest&limit=2000&output=json`;

    const cdxData = await requestJson(cdxUrl, proxyOption);

    if (!Array.isArray(cdxData) || cdxData.length <= 1) {
      return Response.json({
        domain,
        archived: false,
        age: null,
        firstYear: null,
        lastYear: null,
        snapshotsChecked: 0,
        topics: [],
        snapshotUrl: null,
        status: 0,
        proxy: rawProxy || (isProxyEnabled() ? 'env' : null),
      });
    }

    const rows = cdxData.slice(1);
    const first = rows[0];
    const last = rows[rows.length - 1];
    const firstTimestamp = first?.[0] || null;
    const lastTimestamp = last?.[0] || null;
    const firstYear = extractYear(firstTimestamp);
    const lastYear = extractYear(lastTimestamp);
    const timestampsToCheck = pickSnapshots(rows);
    const originalByTimestamp = new Map(rows.map((row) => [row?.[0], row?.[1]]));
    const collectedText = [];

    for (const timestamp of timestampsToCheck) {
      const archivedUrl = buildArchivedUrl(timestamp, originalByTimestamp.get(timestamp), domain);
      const result = await requestText(archivedUrl, { ...proxyOption, timeout: 30000, retries: 5 });
      if (result.ok && result.data) {
        collectedText.push(stripHtml(result.data).slice(0, 15000));
      }
      await sleep(1200);
    }

    const topics = classifyTopics(collectedText.join(' '));

    return Response.json({
      domain,
      archived: true,
      age: calcAge(firstYear),
      firstYear,
      lastYear,
      totalSnapshots: rows.length,
      snapshotsChecked: timestampsToCheck.length,
      topics,
      snapshotUrl: `https://web.archive.org/web/*/${domain}`,
      status: 200,
      proxy: rawProxy || (isProxyEnabled() ? 'env' : null),
    });
  } catch (error) {
    return Response.json({
      domain,
      archived: false,
      age: null,
      firstYear: null,
      lastYear: null,
      snapshotsChecked: 0,
      topics: [],
      snapshotUrl: null,
      status: parseStatusFromError(error),
      proxy: rawProxy || (isProxyEnabled() ? 'env' : null),
      error: error.message || 'Unknown error',
    });
  }
}
