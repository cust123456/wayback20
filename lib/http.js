import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

const DEFAULT_TIMEOUT = Number(process.env.REQUEST_TIMEOUT_MS || 35000);
const RETRIES = Number(process.env.REQUEST_RETRIES || 5);
const RETRY_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeProxyUrl(proxy) {
  const raw = String(proxy || '').trim();
  if (!raw) return null;

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw)) {
    return raw;
  }

  const parts = raw.split(':');
  if (parts.length >= 4 && !raw.includes('@')) {
    const [host, port, username, ...passwordParts] = parts;
    const password = passwordParts.join(':');
    const candidate = `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`;
    try {
      new URL(candidate);
      return candidate;
    } catch (error) {
      // fallback to regular proxy normalization below
    }
  }

  const candidate = `http://${raw}`;
  try {
    new URL(candidate);
    return candidate;
  } catch (error) {
    return null;
  }
}

function getProxyList() {
  const raw = [
    process.env.PROXY_URLS,
    process.env.PROXY_URL,
    process.env.HTTPS_PROXY,
    process.env.https_proxy,
    process.env.HTTP_PROXY,
    process.env.http_proxy,
  ]
    .filter(Boolean)
    .join(',');

  return raw
    .split(',')
    .map((item) => normalizeProxyUrl(item))
    .filter(Boolean);
}

function pickProxy() {
  const proxies = getProxyList();
  if (!proxies.length) return null;
  return proxies[Math.floor(Math.random() * proxies.length)];
}

function createFetchHeaders(accept) {
  return {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    Accept: accept,
    'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  };
}

function makeConfig(url, accept, timeout, proxy) {
  const effectiveProxy = normalizeProxyUrl(proxy) || pickProxy();
  const config = {
    url,
    method: 'GET',
    timeout,
    validateStatus: () => true,
    maxRedirects: 5,
    headers: createFetchHeaders(accept),
  };

  if (effectiveProxy) {
    const agent = new HttpsProxyAgent(effectiveProxy);
    config.httpAgent = agent;
    config.httpsAgent = agent;
    config.proxy = false;
  }

  return config;
}

async function fetchText(url, accept, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: createFetchHeaders(accept),
      redirect: 'follow',
      signal: controller.signal,
    });
    const data = await res.text();
    return { ok: res.ok, status: res.status, data };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('timeout');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function isProxyEnabled() {
  return getProxyList().length > 0;
}

export async function requestText(url, options = {}) {
  const accept = options.accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
  const timeout = options.timeout || DEFAULT_TIMEOUT;
  const retries = options.retries ?? RETRIES;
  const proxyOverride = normalizeProxyUrl(options.proxy || null);
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const proxy = proxyOverride || pickProxy();
      let res;

      if (proxy) {
        res = await axios.request(makeConfig(url, accept, timeout, proxy));
        res = {
          ok: res.status >= 200 && res.status < 300,
          status: res.status,
          data: typeof res.data === 'string' ? res.data : JSON.stringify(res.data || ''),
        };
      } else {
        res = await fetchText(url, accept, timeout);
      }

      if (res.ok) {
        return { ok: true, status: res.status, data: res.data };
      }

      lastError = new Error(`HTTP ${res.status}`);

      if (!RETRY_STATUS_CODES.has(res.status)) {
        return { ok: false, status: res.status, data: res.data, error: lastError.message };
      }
    } catch (error) {
      lastError = error;
    }

    if (attempt < retries) {
      await sleep(1000 * attempt + Math.floor(Math.random() * 700));
    }
  }

  return {
    ok: false,
    status: 0,
    data: '',
    error: lastError?.message || 'Request failed',
  };
}

export async function requestJson(url, options = {}) {
  const result = await requestText(url, {
    ...options,
    accept: 'application/json,text/plain,*/*',
  });

  if (!result.ok) {
    throw new Error(result.error || `HTTP ${result.status}`);
  }

  try {
    return JSON.parse(result.data);
  } catch (error) {
    throw new Error(`Invalid JSON response: ${error.message}`);
  }
}
