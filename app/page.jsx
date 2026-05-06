'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const DANGER_TOPICS = ['Gambling', 'Adult', 'Pharma'];
const CACHE_PREFIX = 'wb_topic_';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function TopicBadges({ topics = [] }) {
  const safeTopics = Array.isArray(topics) ? topics : [];
  if (!safeTopics.length) {
    return <span style={{ color: '#6b7280' }}>No topic detected</span>;
  }

  return (
    <div style={styles.topicWrap}>
      {safeTopics.map((topic) => {
        const isDanger = DANGER_TOPICS.includes(topic);
        return (
          <span
            key={topic}
            style={{
              ...styles.topicBadge,
              ...(isDanger ? styles.topicDanger : styles.topicNormal),
            }}
          >
            {topic}
          </span>
        );
      })}
    </div>
  );
}

export default function HomePage() {
  const [input, setInput] = useState('');
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [total, setTotal] = useState(0);
  const [proxyUrl, setProxyUrl] = useState('');
  const [proxyStatus, setProxyStatus] = useState('not-set');
  const [proxyCheckStatus, setProxyCheckStatus] = useState('idle');
  const [proxyCheckMessage, setProxyCheckMessage] = useState('');
  const [proxyConfirmed, setProxyConfirmed] = useState(false);
  const [filterTerm, setFilterTerm] = useState('');
  const [cleanInfo, setCleanInfo] = useState('');
  const [cancelRequested, setCancelRequested] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const controllerRef = useRef(null);
  const cancelRequestedRef = useRef(false);
  const isPausedRef = useRef(false);

  // Test function to verify JavaScript works
  const testFunction = () => {
    console.log('JavaScript is working!');
    alert('JavaScript is working! Button clicked.');
  };

  const progress = useMemo(() => {
    if (!total) return 0;
    return Math.round((processed / total) * 100);
  }, [processed, total]);

  useEffect(() => {
    const savedProxy = localStorage.getItem('proxy_url') || '';
    if (savedProxy) {
      setProxyUrl(savedProxy);
      setProxyStatus('set');
    }
  }, []);

  function normalizeProxyUrl(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';

    // Already a full URL
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
      try {
        new URL(trimmed);
        return trimmed;
      } catch (error) {
        return '';
      }
    }

    // host:port:user:pass
    const parts = trimmed.split(':');
    if (parts.length >= 4 && !trimmed.includes('@')) {
      const [host, port, username, ...passwordParts] = parts;
      const password = passwordParts.join(':');
      const candidate = `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`;
      try {
        new URL(candidate);
        return candidate;
      } catch (error) {
        return '';
      }
    }

    // user:pass@host:port or host:port
    const candidate = trimmed.includes('@') ? `http://${trimmed}` : `http://${trimmed}`;
    try {
      new URL(candidate);
      return candidate;
    } catch (error) {
      return '';
    }
  }

  function setProxy() {
    const normalized = normalizeProxyUrl(proxyUrl);
    if (!normalized) {
      setProxyStatus('error');
      return;
    }

    localStorage.setItem('proxy_url', normalized);
    setProxyUrl(normalized);
    setProxyStatus('set');
    setProxyConfirmed(false);
    setProxyCheckStatus('idle');
    setProxyCheckMessage('');
  }

  async function checkProxy() {
    const normalized = normalizeProxyUrl(proxyUrl);
    if (!normalized) {
      setProxyStatus('error');
      return;
    }

    setProxyCheckStatus('loading');
    setProxyCheckMessage('Checking proxy (có thể mất vài giây)...');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`/api/proxy-check?proxy=${encodeURIComponent(normalized)}`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await response.json();
      if (data.ok) {
        setProxyCheckStatus('success');
        setProxyConfirmed(true);
        setProxyCheckMessage('Proxy hoạt động OK');
        setProxyUrl(normalized);
        localStorage.setItem('proxy_url', normalized);
        setProxyStatus('set');
      } else {
        setProxyCheckStatus('error');
        setProxyConfirmed(false);
        setProxyCheckMessage(`Proxy lỗi: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      setProxyCheckStatus('error');
      const msg = error.name === 'AbortError' ? 'Proxy timeout (>10s)' : error.message;
      setProxyCheckMessage(`Proxy lỗi: ${msg || 'Không thể kiểm tra proxy'}`);
    }
  }

  function skipCheckAndSetProxy() {
    const normalized = normalizeProxyUrl(proxyUrl);
    if (!normalized) {
      setProxyStatus('error');
      return;
    }

    localStorage.setItem('proxy_url', normalized);
    setProxyUrl(normalized);
    setProxyStatus('set');
    setProxyConfirmed(true);
    setProxyCheckStatus('idle');
    setProxyCheckMessage('');
  }

  function clearProxy() {
    localStorage.removeItem('proxy_url');
    setProxyUrl('');
    setProxyStatus('not-set');
    setProxyCheckStatus('idle');
    setProxyCheckMessage('');
  }

  function shouldRetryError(error) {
    if (!error) return false;
    return /\b(503|504|502|500|timeout|timed out|network error|ECONNRESET|ETIMEDOUT)\b/i.test(error);
  }

  async function fetchDomainData(domain, signal, retryCount = 0) {
    const proxy = proxyConfirmed ? localStorage.getItem('proxy_url') || '' : '';
    const url = proxy
      ? `/api/check?domain=${encodeURIComponent(domain)}&proxy=${encodeURIComponent(proxy)}`
      : `/api/check?domain=${encodeURIComponent(domain)}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 40000); // 40s timeout
      
      const res = await fetch(url, { 
        signal: signal || controller.signal
      });
      clearTimeout(timeout);
      return res.json();
    } catch (error) {
      if (retryCount < 4) {
        // Exponential backoff: 2s, 4s, 8s, 16s
        const backoffMs = Math.pow(2, retryCount + 1) * 1000;
        await sleep(backoffMs);
        return fetchDomainData(domain, signal, retryCount + 1);
      }
      throw error;
    }
  }

  function stopProcessing() {
    if (!isLoading || isStopping) return;
    setCancelRequested(true);
    cancelRequestedRef.current = true;
    setIsStopping(true);
    if (controllerRef.current) {
      controllerRef.current.abort();
    }
  }

  function togglePauseProcessing() {
    if (!isLoading || isStopping) return;
    const nextPaused = !isPaused;
    setIsPaused(nextPaused);
    isPausedRef.current = nextPaused;
  }

  async function checkDomains() {
    if (isLoading) return;

    const domains = input
      .split('\n')
      .map((row) => row.replace(/^https?:\/\//i, '').trim())
      .filter(Boolean);

    const normalizedFilter = filterTerm.trim().toLowerCase();
    const domainsToCheck = domains.filter((domain) => {
      if (!normalizedFilter) return true;
      return domain.toLowerCase().includes(normalizedFilter);
    });

    if (!domainsToCheck.length) return;

    setResults([]);
    setProcessed(0);
    setTotal(domainsToCheck.length);
    setIsLoading(true);
    setCancelRequested(false);
    cancelRequestedRef.current = false;
    setIsStopping(false);
    setIsPaused(false);
    isPausedRef.current = false;

    controllerRef.current = new AbortController();
    const signal = controllerRef.current.signal;
    const concurrency = 1; // Xử lý 1 domain một lúc để tránh quá tải
    const resultsBuffer = Array(domainsToCheck.length).fill(null);
    let nextIndex = 0;

    async function processDomain(domain) {
      const cacheKey = `${CACHE_PREFIX}${domain.toLowerCase()}`;
      const cached = localStorage.getItem(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }

      try {
        const data = await fetchDomainData(domain, signal);
        localStorage.setItem(cacheKey, JSON.stringify(data));
        return data;
      } catch (error) {
        const errorData = {
          domain,
          archived: false,
          age: null,
          firstYear: null,
          lastYear: null,
          topics: [],
          snapshotUrl: null,
          status: 0,
          error: error.name === 'AbortError' ? 'Cancelled' : error.message || 'Failed to check domain',
        };
        localStorage.setItem(cacheKey, JSON.stringify(errorData));
        return errorData;
      }
    }

    async function worker() {
      while (!cancelRequestedRef.current && !signal.aborted) {
        while (isPausedRef.current && !cancelRequestedRef.current && !signal.aborted) {
          await sleep(500);
        }

        const currentIndex = nextIndex;
        nextIndex += 1;
        if (currentIndex >= domainsToCheck.length) break;

        const domain = domainsToCheck[currentIndex];

        try {
          const data = await processDomain(domain);
          resultsBuffer[currentIndex] = data;
          setResults(() => resultsBuffer.filter(Boolean));
          setProcessed((prev) => prev + 1);
          
          if (!signal.aborted && currentIndex < domainsToCheck.length - 1) {
            await sleep(1500); // Delay giữa các request
          }
        } catch (error) {
          if (error.name === 'AbortError') {
            break;
          }

          resultsBuffer[currentIndex] = {
            domain,
            archived: false,
            age: null,
            firstYear: null,
            lastYear: null,
            topics: [],
            snapshotUrl: null,
            status: 0,
            error: error.message || 'Failed to check domain',
          };
          
          setResults(() => resultsBuffer.filter(Boolean));
          setProcessed((prev) => prev + 1);
        }
      }
    }

    try {
      const workers = Array.from({ length: concurrency }, () => worker());
      await Promise.all(workers);
    } finally {
      setIsLoading(false);
      setIsStopping(false);
      controllerRef.current = null;
    }
  }

  function normalizeDomainLine(line) {
    const cleaned = String(line || '')
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split(/[\s\/]+/)[0]
      .replace(/[^a-zA-Z0-9.-]/g, '');

    if (!cleaned) return null;
    const domain = cleaned.toLowerCase();
    if (!/[a-z]/.test(domain)) return null; // require at least one letter to avoid numeric prices
    if (/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z]{2,24})+$/.test(domain)) {
      return domain;
    }
    return null;
  }

  function dedupeDomains() {
    const lines = String(input || '').split(/\r?\n/);
    const cleanedDomains = lines
      .map((row) => normalizeDomainLine(row))
      .filter(Boolean);

    const uniqueDomains = Array.from(new Set(cleanedDomains));
    setInput(uniqueDomains.join('\n'));
    setResults([]);
    setProcessed(0);
    setTotal(0);
    setCleanInfo(`Đã lọc ${uniqueDomains.length} domain, loại bỏ ${lines.length - uniqueDomains.length} dòng không hợp lệ.`);
  }

  function loadSampleDomains() {
    setInput([
      'example.com',
      'expired-domain.net',
      'oldsite.org',
      'demo-site.us',
      'archive-test.com',
      'sample-domain.io',
      'web-history.net',
      'domain-scan.org',
      'oldpage.store',
      'testarchive.site',
    ].join('\n'));
  }

  function exportResults() {
    if (!results.length) return;
    const header = ['domain,status,age,firstYear,lastYear,topics,snapshotUrl'];
    const rows = results.map((item) => [
      item.domain,
      item.status || '',
      item.age || '',
      item.firstYear || '',
      item.lastYear || '',
      Array.isArray(item.topics) ? item.topics.join('|') : '',
      item.snapshotUrl || '',
    ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','));

    const csv = [...header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'archive-results.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main style={styles.container}>
      <div style={styles.heroSection}>
        <div style={styles.heroContent}>
          <p style={styles.heroBadge}>Archive Checker Pro</p>
          <h1 style={styles.heroTitle}>Công cụ kiểm tra lưu trữ domain siêu tốc.</h1>
          <p style={styles.heroText}>
            Xử lý tới 1000 domain với 10 domain mỗi batch và xử lý song song để đạt tốc độ tối đa.
          </p>
          <p style={styles.heroNote}>Tool check archive của GENO KJC</p>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div>
            <h2 style={styles.cardTitle}>Kiểm Tra Hàng Loạt Nhanh Chóng</h2>
            <p style={styles.cardSubtitle}>
              Quét hiệu suất cao: 10 domain mỗi batch · Xử lý song song · Tối ưu production · Không lỗi tín hiệu
            </p>
          </div>
          <span style={styles.batchBadge}>Chế độ Tốc Độ Cao</span>
        </div>

        <div style={styles.panel}>          
          <div style={styles.panelHeader}>
            <div>
              <div style={styles.panelLabel}>Danh Sách Domain ({input.split('\n').filter(Boolean).length} domain)</div>
              <div style={styles.panelHint}>Nhập mỗi domain một dòng, bỏ http/https.</div>
            </div>
          </div>

          <textarea
            rows={12}
            placeholder={'example.com\nexpired-domain.net\noldsite.org'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            style={styles.textarea}
          />

          <div style={styles.actionsMain}>
            <button onClick={testFunction} style={styles.primaryButton}>
              Test JavaScript
            </button>
            <button onClick={checkDomains} disabled={isLoading} style={styles.primaryButton}>
              {isLoading ? 'Đang Quét...' : 'Bắt Đầu Quét Tốc Độ Cao'}
            </button>
            {isLoading && (
              <>
                <button onClick={togglePauseProcessing} disabled={isStopping} style={styles.pauseButton}>
                  {isPaused ? 'Tiếp tục' : 'Tạm dừng'}
                </button>
                <button onClick={stopProcessing} disabled={isStopping} style={styles.cancelButton}>
                  {isStopping ? 'Đang Dừng...' : 'Dừng hẳn'}
                </button>
              </>
            )}
            <button onClick={dedupeDomains} disabled={isLoading} style={styles.outlineButton}>
              Lọc & Làm Sạch
            </button>
            <button onClick={loadSampleDomains} disabled={isLoading} style={styles.outlineButton}>
              Tải Domain Mẫu
            </button>
            <button onClick={exportResults} disabled={!results.length} style={styles.outlineButton}>
              Xuất Kết Quả
            </button>
          </div>
          {cleanInfo ? <div style={styles.cleanInfo}>{cleanInfo}</div> : null}

          <div style={styles.controlRow}>
            <div style={styles.controlItem}>
              <span style={styles.controlLabel}>Proxy</span>
              <span style={styles.controlValue}>{proxyUrl ? proxyUrl : 'Chưa cấu hình'}</span>
            </div>
            <div style={styles.controlItem}>
              <span style={styles.controlLabel}>Filter</span>
              <span style={styles.controlValue}>{filterTerm || 'Không'}</span>
            </div>
            <div style={styles.controlItem}>
              <span style={styles.controlLabel}>Hoàn thành</span>
              <span style={styles.controlValue}>{processed}/{total}</span>
            </div>
          </div>

          <div style={styles.runningInfo}>
            <div style={styles.runningStatus}>Đang xử lý batch 1 / 9</div>
            <div style={styles.runningMeta}>10 domain mỗi batch · Xử lý song song · Chế độ tốc độ cao</div>
            <div style={styles.runningProgress}>{progress}% hoàn thành</div>
          </div>

          <div style={styles.proxyPanel}>
            <div style={styles.proxyForm}>
              <label style={styles.proxyLabel}>Proxy URL (tuỳ chọn):</label>
              <input
                type="text"
                placeholder="http://user:pass@ip:port hoặc host:port"
                value={proxyUrl}
                onChange={(e) => setProxyUrl(e.target.value)}
                style={styles.proxyInputDark}
              />
              <button onClick={setProxy} disabled={isLoading} style={styles.proxyButton}>
                Set
              </button>
              <button onClick={checkProxy} disabled={isLoading} style={styles.proxyButton}>
                Check
              </button>
              <button onClick={skipCheckAndSetProxy} disabled={isLoading} style={styles.proxyButton}>
                Use
              </button>
              <button onClick={clearProxy} disabled={isLoading} style={styles.proxyClearButton}>
                Clear
              </button>
            </div>
            <div style={styles.proxyHint}>
              HTTP 407 thường là proxy cần chứng thực. Nếu dùng proxy, hãy thử định dạng
              <strong> host:port:user:pass</strong> hoặc <strong>http://user:pass@host:port</strong>.
            </div>
            {proxyCheckStatus === 'loading' && <div style={styles.proxyStatus}>Đang kiểm tra proxy...</div>}
            {proxyCheckStatus === 'success' && <div style={styles.proxyOk}>{proxyCheckMessage}</div>}
            {proxyCheckStatus === 'error' && <div style={styles.proxyError}>{proxyCheckMessage}</div>}
          </div>
        </div>
      </div>

      {results.length > 0 && (
        <section style={styles.resultsSection}>
          <div style={styles.resultsHeader}>
            <h3 style={styles.resultsTitle}>Kết Quả Quét ({results.length} domain)</h3>
            <div style={styles.resultsMeta}>
              <span style={styles.resultBadge}>Hoàn thành: {results.filter((item) => item.archived).length}</span>
              <span style={styles.resultBadgeError}>Lỗi: {results.filter((item) => item.error).length}</span>
              <span style={styles.resultBadge}>TB: {total ? `${Math.round((processed ? processed : 0) / total * 100)}%` : '0%'}</span>
            </div>
          </div>

          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Domain</th>
                  <th style={styles.thCenter}>Trạng Thái</th>
                  <th style={styles.thCenter}>Số Năm</th>
                  <th style={styles.thCenter}>Năm Đầu</th>
                  <th style={styles.thCenter}>Năm Cuối</th>
                  <th style={styles.thCenter}>Topic</th>
                  <th style={styles.thCenter}>Hành Động</th>
                </tr>
              </thead>
              <tbody>
                {results.map((item, index) => {
                  const isDanger = item.topics?.some((topic) => DANGER_TOPICS.includes(topic));
                  return (
                    <tr key={`${item.domain}-${index}`} style={isDanger ? styles.rowDanger : undefined}>
                      <td style={styles.td}>
                        <strong>{item.domain}</strong>
                        {item.error ? <div style={styles.errorText}>{item.error}</div> : null}
                      </td>
                      <td style={styles.tdCenter}>{item.status || (item.error ? 'Lỗi' : 'Chờ xử lý')}</td>
                      <td style={styles.tdCenter}>{item.age ? `${item.age}` : '-'}</td>
                      <td style={styles.tdCenter}>{item.firstYear || '-'}</td>
                      <td style={styles.tdCenter}>{item.lastYear || '-'}</td>
                      <td style={styles.tdCenter}>
                        <TopicBadges topics={item.topics} />
                      </td>
                      <td style={styles.tdCenter}>
                        {item.snapshotUrl ? (
                          <a href={item.snapshotUrl} target="_blank" rel="noreferrer" style={styles.link}>
                            Xem
                          </a>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

const styles = {
  container: {
    maxWidth: 1280,
    margin: '0 auto',
    padding: '40px 20px 80px',
  },
  heroSection: {
    marginBottom: 32,
    padding: '32px 28px',
    borderRadius: 24,
    background: 'linear-gradient(135deg, rgba(7, 13, 31, 0.98), rgba(13, 20, 45, 0.98))',
    border: '1px solid rgba(148,163,184,0.14)',
    boxShadow: '0 30px 60px rgba(0, 0, 0, 0.28)',
  },
  heroContent: {
    maxWidth: 820,
    margin: '0 auto',
  },
  heroBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 18,
    padding: '10px 16px',
    background: '#0f172a',
    color: '#60a5fa',
    borderRadius: 999,
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: '0.03em',
  },
  heroTitle: {
    margin: 0,
    fontSize: 48,
    lineHeight: 1.1,
    letterSpacing: '-0.03em',
    color: '#eff6ff',
  },
  heroText: {
    marginTop: 18,
    marginBottom: 4,
    maxWidth: 760,
    fontSize: 18,
    color: '#cbd5e1',
    lineHeight: 1.75,
  },
  heroNote: {
    fontSize: 14,
    color: '#94a3b8',
  },
  card: {
    background: '#07121f',
    border: '1px solid rgba(148,163,184,0.14)',
    borderRadius: 28,
    padding: 28,
    boxShadow: '0 24px 60px rgba(10, 18, 32, 0.35)',
  },
  cardHeader: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 18,
    alignItems: 'center',
    marginBottom: 24,
  },
  cardTitle: {
    margin: 0,
    fontSize: 28,
    fontWeight: 800,
    color: '#f8fafc',
  },
  cardSubtitle: {
    margin: '10px 0 0',
    fontSize: 15,
    color: '#94a3b8',
    lineHeight: 1.7,
  },
  batchBadge: {
    padding: '10px 16px',
    background: 'rgba(59,130,246,0.12)',
    border: '1px solid rgba(59,130,246,0.24)',
    borderRadius: 999,
    color: '#bfdbfe',
    fontWeight: 700,
    fontSize: 13,
  },
  panel: {
    background: '#101d33',
    border: '1px solid rgba(148,163,184,0.16)',
    borderRadius: 24,
    padding: 22,
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  panelLabel: {
    color: '#e2e8f0',
    fontWeight: 700,
    fontSize: 14,
  },
  panelHint: {
    marginTop: 6,
    color: '#94a3b8',
    fontSize: 13,
  },
  textarea: {
    width: '100%',
    minHeight: 320,
    borderRadius: 20,
    border: '1px solid rgba(148,163,184,0.18)',
    background: '#121e36',
    color: '#f8fafc',
    padding: 18,
    fontSize: 15,
    lineHeight: 1.65,
    resize: 'vertical',
    outline: 'none',
  },
  actionsMain: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 12,
    marginTop: 20,
  },
  primaryButton: {
    border: 0,
    background: 'linear-gradient(90deg, #2563eb, #2563eb)',
    color: '#fff',
    padding: '16px 22px',
    borderRadius: 16,
    fontWeight: 800,
    fontSize: 15,
    cursor: 'pointer',
    minWidth: 200,
  },
  outlineButton: {
    border: '1px solid rgba(148,163,184,0.24)',
    background: 'rgba(15,23,42,0.75)',
    color: '#cbd5e1',
    padding: '16px 22px',
    borderRadius: 16,
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
    minWidth: 180,
  },
  pauseButton: {
    border: 0,
    background: 'linear-gradient(90deg, #f59e0b, #d97706)',
    color: '#fff',
    padding: '16px 22px',
    borderRadius: 16,
    fontWeight: 800,
    fontSize: 15,
    cursor: 'pointer',
    minWidth: 180,
  },
  controlRow: {
    marginTop: 24,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 12,
  },
  proxyPanel: {
    marginTop: 24,
    padding: 20,
    borderRadius: 24,
    border: '1px solid rgba(148,163,184,0.14)',
    background: 'rgba(25, 40, 65, 0.95)',
  },
  proxyForm: {
    display: 'grid',
    gridTemplateColumns: '1.5fr 3fr repeat(4, minmax(100px, max-content))',
    gap: 10,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  proxyInputDark: {
    width: '100%',
    borderRadius: 14,
    border: '1px solid rgba(148,163,184,0.18)',
    background: '#142a4a',
    color: '#f8fafc',
    padding: 12,
    fontSize: 14,
  },
  controlItem: {
    background: 'rgba(148,163,184,0.08)',
    border: '1px solid rgba(148,163,184,0.12)',
    borderRadius: 16,
    padding: 16,
  },
  controlLabel: {
    display: 'block',
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  controlValue: {
    color: '#e2e8f0',
  cleanInfo: {
    marginTop: 16,
    color: '#a5b4fc',
    fontSize: 14,
    fontWeight: 600,
  },
    fontWeight: 700,
    fontSize: 15,
  },
  runningInfo: {
    marginTop: 24,
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: 8,
    padding: 18,
    borderRadius: 18,
    background: 'rgba(30,41,59,0.9)',
    border: '1px solid rgba(148,163,184,0.16)',
  },
  runningStatus: {
    color: '#e2e8f0',
    fontWeight: 700,
    fontSize: 15,
  },
  runningMeta: {
    color: '#94a3b8',
    fontSize: 13,
  },
  runningProgress: {
    marginTop: 14,
    fontWeight: 800,
    color: '#60a5fa',
    fontSize: 14,
  },
  resultsSection: {
    marginTop: 32,
  },
  resultsHeader: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'center',
    marginBottom: 18,
  },
  resultsTitle: {
    margin: 0,
    fontSize: 24,
    color: '#f8fafc',
  },
  resultsMeta: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
  },
  resultBadge: {
    padding: '10px 14px',
    borderRadius: 999,
    background: 'rgba(96,165,250,0.16)',
    color: '#c7d2fe',
    fontSize: 13,
    fontWeight: 700,
  },
  resultBadgeError: {
    padding: '10px 14px',
    borderRadius: 999,
    background: 'rgba(248,113,113,0.16)',
    color: '#fecaca',
    fontSize: 13,
    fontWeight: 700,
  },
  tableWrap: {
    overflowX: 'auto',
    border: '1px solid rgba(148,163,184,0.1)',
    borderRadius: 24,
    background: '#101d33',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left',
    padding: 16,
    borderBottom: '1px solid rgba(148,163,184,0.12)',
    background: '#0b162b',
    color: '#e2e8f0',
    fontWeight: 700,
    fontSize: 13,
  },
  thCenter: {
    textAlign: 'center',
    padding: 16,
    borderBottom: '1px solid rgba(148,163,184,0.12)',
    background: '#0b162b',
    color: '#e2e8f0',
    fontWeight: 700,
    fontSize: 13,
  },
  td: {
    padding: 16,
    borderBottom: '1px solid rgba(148,163,184,0.12)',
    verticalAlign: 'top',
    color: '#eff2ff',
  },
  tdCenter: {
    padding: 16,
    borderBottom: '1px solid rgba(148,163,184,0.12)',
    textAlign: 'center',
    verticalAlign: 'middle',
    color: '#eff2ff',
  },
  topicWrap: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
  },
  topicBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '6px 10px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
  },
  topicNormal: {
    background: '#334155',
    color: '#e2e8f0',
  },
  topicDanger: {
    background: '#7f1d1d',
    color: '#fee2e2',
    border: '1px solid #fca5a5',
  },
  rowDanger: {
    background: 'rgba(248,113,113,0.08)',
  },
  link: {
    color: '#60a5fa',
    fontWeight: 700,
    textDecoration: 'none',
  },
  errorText: {
    fontSize: 12,
    color: '#fecaca',
    marginTop: 6,
  },
};
