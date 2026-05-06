import { requestText, isProxyEnabled } from '../../../lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const rawProxy = searchParams.get('proxy') || '';
  const proxyOption = rawProxy ? { proxy: rawProxy } : {};

  if (!rawProxy) {
    return Response.json({ ok: false, error: 'Missing proxy parameter' }, { status: 400 });
  }

  try {
    const result = await requestText(
      'https://web.archive.org/cdx/search/cdx?url=example.com&fl=timestamp&limit=1&output=json',
      {
        timeout: 30000,
        retries: 1,
        ...proxyOption,
      }
    );

    if (!result.ok) {
      throw new Error(result.error || `HTTP ${result.status}`);
    }

    return Response.json({ ok: true, status: result.status, proxy: rawProxy || (isProxyEnabled() ? 'env' : null) });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error.message || 'Proxy test failed',
        proxy: rawProxy || (isProxyEnabled() ? 'env' : null),
      },
      { status: 200 }
    );
  }
}
