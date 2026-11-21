import { assertSafeStudyDataPath, STUDY_DATA_PREFIX } from '../../src/sync/sharding.ts';

export interface MoonCodeServerEnv {
  APP_URL?: string;
  APP_ORIGIN?: string;
  GITHUB_APP_ID?: string;
  GITHUB_APP_CLIENT_ID?: string;
  GITHUB_APP_CLIENT_SECRET?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  GITHUB_APP_INSTALLATION_ID?: string;
  GITHUB_DATA_OWNER?: string;
  GITHUB_DATA_REPO?: string;
  GITHUB_DATA_BRANCH?: string;
  ALLOWED_GITHUB_USER_ID?: string;
  SESSION_SECRET?: string;
}

export interface SessionPayload {
  userId: string;
  login: string;
  exp: number;
}

const SESSION_COOKIE = 'mooncode_session';
const OAUTH_TX_COOKIE = 'mooncode_oauth_tx';
const MAX_PUBLISH_BYTES = 4 * 1024 * 1024;
const MAX_BLOBS_PER_COMMIT = 250;

function jsonResponse(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, private',
      ...extraHeaders,
    },
  });
}

function parseCookies(cookieHeader: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacSign(secret: string, data: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await globalThis.crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return base64UrlEncode(new Uint8Array(sig));
}

async function signCookiePayload(secret: string, obj: unknown): Promise<string> {
  const body = base64UrlEncode(new TextEncoder().encode(JSON.stringify(obj)));
  const sig = await hmacSign(secret, body);
  return `${body}.${sig}`;
}

async function verifyCookiePayload<T>(secret: string, token: string | undefined): Promise<T | null> {
  if (!token || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expectedSig = await hmacSign(secret, body);
  if (sig.length !== expectedSig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const decoded = new TextDecoder().decode(base64UrlDecode(body));
    return JSON.parse(decoded) as T;
  } catch {
    return null;
  }
}

function buildCookieString(name: string, value: string, maxAgeSeconds: number, isHttps: boolean): string {
  const attrs = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (isHttps) {
    attrs.push('Secure', 'SameSite=None');
  } else {
    attrs.push('SameSite=Lax');
  }
  return attrs.join('; ');
}

export function isSyncConfigured(env: MoonCodeServerEnv): boolean {
  return Boolean(
    env.GITHUB_APP_ID &&
      env.GITHUB_APP_CLIENT_ID &&
      env.GITHUB_APP_CLIENT_SECRET &&
      env.GITHUB_APP_PRIVATE_KEY &&
      env.GITHUB_APP_INSTALLATION_ID &&
      env.GITHUB_DATA_OWNER &&
      env.GITHUB_DATA_REPO &&
      env.ALLOWED_GITHUB_USER_ID &&
      env.SESSION_SECRET
  );
}

function getEffectiveOrigin(request: Request, env: MoonCodeServerEnv): string {
  if (env.APP_ORIGIN) return env.APP_ORIGIN.replace(/\/+$/, '');
  if (env.APP_URL && !env.APP_URL.includes('MY_APP_URL')) return env.APP_URL.replace(/\/+$/, '');
  const url = new URL(request.url);
  return url.origin;
}

function isOriginAllowed(request: Request, env: MoonCodeServerEnv): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const expected = getEffectiveOrigin(request, env);
  const urlOrigin = new URL(request.url).origin;
  return origin === expected || origin === urlOrigin;
}

function wrapPkcs1ToPkcs8(pkcs1Bytes: Uint8Array): Uint8Array {
  // ASN.1 Sequence wrapper for PKCS#1 RSA private key -> PKCS#8
  const version = new Uint8Array([0x02, 0x01, 0x00]);
  const algId = new Uint8Array([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
  ]);
  function derLength(len: number): Uint8Array {
    if (len < 128) return new Uint8Array([len]);
    if (len < 256) return new Uint8Array([0x81, len]);
    return new Uint8Array([0x82, (len >> 8) & 0xff, len & 0xff]);
  }
  const octLen = derLength(pkcs1Bytes.length);
  const octPrefix = new Uint8Array(1 + octLen.length);
  octPrefix[0] = 0x04;
  octPrefix.set(octLen, 1);

  const innerLen = version.length + algId.length + octPrefix.length + pkcs1Bytes.length;
  const seqLen = derLength(innerLen);
  const out = new Uint8Array(1 + seqLen.length + innerLen);
  let offset = 0;
  out[offset++] = 0x30;
  out.set(seqLen, offset);
  offset += seqLen.length;
  out.set(version, offset);
  offset += version.length;
  out.set(algId, offset);
  offset += algId.length;
  out.set(octPrefix, offset);
  offset += octPrefix.length;
  out.set(pkcs1Bytes, offset);
  return out;
}

async function createGitHubAppJwt(appId: string, pemRaw: string): Promise<string> {
  const normalizedPem = pemRaw.replace(/\\n/g, '\n').trim();
  const isPkcs1 = normalizedPem.includes('BEGIN RSA PRIVATE KEY');
  const b64 = normalizedPem
    .replace(/-----BEGIN [A-Z ]+-----/g, '')
    .replace(/-----END [A-Z ]+-----/g, '')
    .replace(/\s+/g, '');
  const rawDer = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const pkcs8Der = isPkcs1 ? wrapPkcs1ToPkcs8(rawDer) : rawDer;

  const keyCopy = new Uint8Array(pkcs8Der.byteLength);
  keyCopy.set(pkcs8Der);

  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'pkcs8',
    keyCopy.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const payload = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }))
  );
  const sig = await globalThis.crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(`${header}.${payload}`)
  );
  return `${header}.${payload}.${base64UrlEncode(new Uint8Array(sig))}`;
}

let cachedInstallationToken: { token: string; expiresAtMs: number } | null = null;

async function getInstallationToken(env: MoonCodeServerEnv): Promise<string> {
  if (cachedInstallationToken && Date.now() < cachedInstallationToken.expiresAtMs - 60_000) {
    return cachedInstallationToken.token;
  }
  const jwt = await createGitHubAppJwt(env.GITHUB_APP_ID!, env.GITHUB_APP_PRIVATE_KEY!);
  const res = await fetch(
    `https://api.github.com/app/installations/${env.GITHUB_APP_INSTALLATION_ID}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'MoonCode-Study-Sync/1.0',
      },
    }
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`無法取得 GitHub App installation token (${res.status}): ${txt.slice(0, 200)}`);
  }
  const data = (await res.json()) as { token: string; expires_at: string };
  cachedInstallationToken = {
    token: data.token,
    expiresAtMs: Date.parse(data.expires_at),
  };
  return data.token;
}

async function ghFetch(
  path: string,
  token: string,
  init: RequestInit = {}
): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'MoonCode-Study-Sync/1.0',
      ...(init.headers ?? {}),
    },
  });
}

function parseRateLimitRetryMs(res: Response): number | undefined {
  const retryAfter = res.headers.get('retry-after');
  if (retryAfter) {
    const sec = Number(retryAfter);
    if (!Number.isNaN(sec)) return Math.min(30_000, Math.max(500, sec * 1000));
  }
  const reset = res.headers.get('x-ratelimit-reset');
  if (reset && res.headers.get('x-ratelimit-remaining') === '0') {
    const resetMs = Number(reset) * 1000 - Date.now();
    if (!Number.isNaN(resetMs) && resetMs > 0) return Math.min(30_000, resetMs);
  }
  return undefined;
}

export async function handleApiRequest(
  request: Request,
  env: MoonCodeServerEnv
): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const isHttps = url.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
  const configured = isSyncConfigured(env);

  if (pathname === '/api/health') {
    return jsonResponse({ ok: true, mode: configured ? 'github_configured' : 'local_only' });
  }

  // Session inspection (never exposes tokens or secrets)
  if (pathname === '/api/auth/session' && request.method === 'GET') {
    if (!configured) {
      return jsonResponse({ configured: false, authenticated: false, mode: 'local_only' });
    }
    const cookies = parseCookies(request.headers.get('cookie'));
    const session = await verifyCookiePayload<SessionPayload>(
      env.SESSION_SECRET!,
      cookies[SESSION_COOKIE]
    );
    if (!session || session.exp < Date.now() || session.userId !== env.ALLOWED_GITHUB_USER_ID) {
      return jsonResponse({ configured: true, authenticated: false, mode: 'unauthenticated' });
    }
    return jsonResponse({
      configured: true,
      authenticated: true,
      mode: 'authenticated',
      user: { id: session.userId, login: session.login },
      targetRepo: `${env.GITHUB_DATA_OWNER}/${env.GITHUB_DATA_REPO}`,
      branch: env.GITHUB_DATA_BRANCH || 'main',
    });
  }

  if (pathname === '/api/auth/login-url' && request.method === 'GET') {
    if (!configured) {
      return jsonResponse(
        { error: '尚未設定 GitHub App 環境變數，目前維持本機模式。' },
        400
      );
    }
    const stateBytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(stateBytes);
    const state = base64UrlEncode(stateBytes);

    const verifierBytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(verifierBytes);
    const codeVerifier = base64UrlEncode(verifierBytes);
    const challengeDigest = await globalThis.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(codeVerifier)
    );
    const codeChallenge = base64UrlEncode(new Uint8Array(challengeDigest));

    const redirectUri = `${getEffectiveOrigin(request, env)}/api/auth/callback`;
    const params = new URLSearchParams({
      client_id: env.GITHUB_APP_CLIENT_ID!,
      redirect_uri: redirectUri,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const txCookie = await signCookiePayload(env.SESSION_SECRET!, {
      state,
      codeVerifier,
      exp: Date.now() + 10 * 60 * 1000,
    });

    return jsonResponse(
      { url: `https://github.com/login/oauth/authorize?${params.toString()}`, redirectUri },
      200,
      { 'Set-Cookie': buildCookieString(OAUTH_TX_COOKIE, txCookie, 600, isHttps) }
    );
  }

  if ((pathname === '/api/auth/callback' || pathname === '/api/auth/callback/') && request.method === 'GET') {
    if (!configured) {
      return new Response('GitHub App is not configured.', { status: 400 });
    }
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const cookies = parseCookies(request.headers.get('cookie'));
    const tx = await verifyCookiePayload<{ state: string; codeVerifier: string; exp: number }>(
      env.SESSION_SECRET!,
      cookies[OAUTH_TX_COOKIE]
    );

    if (!code || !state || !tx || tx.exp < Date.now() || tx.state !== state) {
      return new Response('OAuth state verification failed or expired.', { status: 400 });
    }

    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: env.GITHUB_APP_CLIENT_ID,
        client_secret: env.GITHUB_APP_CLIENT_SECRET,
        code,
        code_verifier: tx.codeVerifier,
        redirect_uri: `${getEffectiveOrigin(request, env)}/api/auth/callback`,
      }),
    });
    const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };
    if (!tokenRes.ok || !tokenData.access_token) {
      return new Response('GitHub OAuth token exchange failed.', { status: 401 });
    }

    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'MoonCode-Study-Sync/1.0',
      },
    });
    if (!userRes.ok) {
      return new Response('Failed to verify GitHub user identity.', { status: 401 });
    }
    const ghUser = (await userRes.json()) as { id: number; login: string };
    if (String(ghUser.id) !== String(env.ALLOWED_GITHUB_USER_ID)) {
      return new Response('Forbidden: GitHub user ID is not in allowlist.', { status: 403 });
    }

    const sessionToken = await signCookiePayload(env.SESSION_SECRET!, {
      userId: String(ghUser.id),
      login: ghUser.login,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    } satisfies SessionPayload);

    const headers = new Headers({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    headers.append('Set-Cookie', buildCookieString(SESSION_COOKIE, sessionToken, 7 * 86400, isHttps));
    headers.append('Set-Cookie', buildCookieString(OAUTH_TX_COOKIE, '', 0, isHttps));

    return new Response(
      `<!doctype html><html><body style="background:#0b111a;color:#eef3f8;font-family:sans-serif;padding:2rem;">
        <p>GitHub 登入成功，正在返回 MoonCode…</p>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'MOONCODE_GITHUB_AUTH_SUCCESS' }, '*');
            window.close();
          } else {
            window.location.href = '/';
          }
        </script>
      </body></html>`,
      { status: 200, headers }
    );
  }

  if (pathname === '/api/auth/logout' && request.method === 'POST') {
    if (!isOriginAllowed(request, env) || request.headers.get('x-mooncode-csrf') !== '1') {
      return jsonResponse({ error: 'CSRF 或 Origin 驗證失敗' }, 403);
    }
    return jsonResponse(
      { ok: true },
      200,
      { 'Set-Cookie': buildCookieString(SESSION_COOKIE, '', 0, isHttps) }
    );
  }

  // Status endpoint is safe for unauthenticated preview inspection (does not leak secrets)
  if (pathname === '/api/sync/status' && request.method === 'GET') {
    if (!configured) {
      return jsonResponse({
        configured: false,
        authenticated: false,
        message: '未設定 GitHub App 憑證，目前以「本機模式」運行，資料可靠儲存於本機 IndexedDB。',
      });
    }
    const cookies = parseCookies(request.headers.get('cookie'));
    const session = await verifyCookiePayload<SessionPayload>(
      env.SESSION_SECRET!,
      cookies[SESSION_COOKIE]
    );
    const okAuth = Boolean(
      session && session.exp > Date.now() && session.userId === env.ALLOWED_GITHUB_USER_ID
    );
    return jsonResponse({
      configured: true,
      authenticated: okAuth,
      message: okAuth
        ? `已授權同步至私有資料倉庫 ${env.GITHUB_DATA_OWNER}/${env.GITHUB_DATA_REPO}`
        : 'GitHub App 已設定，請於「設定」登入允許的 GitHub 帳號以啟用雲端同步。',
    });
  }

  // All /api/sync/* routes below REQUIRE authenticated allowlisted session
  if (pathname.startsWith('/api/sync/')) {
    if (!configured) {
      return jsonResponse({ error: 'GitHub App 尚未設定，無法執行雲端同步。' }, 503);
    }
    const cookies = parseCookies(request.headers.get('cookie'));
    const session = await verifyCookiePayload<SessionPayload>(
      env.SESSION_SECRET!,
      cookies[SESSION_COOKIE]
    );
    if (!session || session.exp < Date.now()) {
      return jsonResponse({ error: '未登入或連線憑證已過期' }, 401);
    }
    if (session.userId !== env.ALLOWED_GITHUB_USER_ID) {
      return jsonResponse({ error: '此 GitHub 使用者 ID 不在允許名單內' }, 403);
    }

    const owner = env.GITHUB_DATA_OWNER!;
    const repo = env.GITHUB_DATA_REPO!;
    const branch = env.GITHUB_DATA_BRANCH || 'main';
    const token = await getInstallationToken(env);

    if (pathname === '/api/sync/head' && request.method === 'GET') {
      const refRes = await ghFetch(`/repos/${owner}/${repo}/git/ref/heads/${branch}`, token);
      if (refRes.status === 404 || refRes.status === 409) {
        return jsonResponse(
          {
            error: `資料倉庫 ${owner}/${repo} 的分支 ${branch} 尚未初始化。請依 README 在該私有 repo 建立初始 README.md。`,
            needsRepoInit: true,
          },
          404
        );
      }
      if (!refRes.ok) {
        return jsonResponse({ error: `讀取 Git ref 失敗 (${refRes.status})` }, refRes.status);
      }
      const refJson = (await refRes.json()) as { object: { sha: string } };
      const commitSha = refJson.object.sha;

      const headFileRes = await ghFetch(
        `/repos/${owner}/${repo}/contents/${STUDY_DATA_PREFIX}/HEAD.json?ref=${commitSha}`,
        token,
        { headers: { Accept: 'application/vnd.github.raw+json' } }
      );
      if (headFileRes.status === 404) {
        return jsonResponse({ commitSha, headRawUtf8: null });
      }
      if (!headFileRes.ok) {
        return jsonResponse({ error: `讀取 HEAD.json 失敗 (${headFileRes.status})` }, headFileRes.status);
      }
      const headRawUtf8 = await headFileRes.text();
      return jsonResponse({ commitSha, headRawUtf8 });
    }

    if (pathname === '/api/sync/object' && request.method === 'GET') {
      const objPath = url.searchParams.get('path') ?? '';
      const ref = url.searchParams.get('ref') ?? '';
      try {
        assertSafeStudyDataPath(objPath);
      } catch (e) {
        return jsonResponse({ error: (e as Error).message }, 400);
      }
      if (!/^[a-f0-9]{7,64}$/i.test(ref)) {
        return jsonResponse({ error: '必須指定明確的 Git commit SHA ref' }, 400);
      }
      const res = await ghFetch(
        `/repos/${owner}/${repo}/contents/${objPath}?ref=${ref}`,
        token,
        { headers: { Accept: 'application/vnd.github.raw+json' } }
      );
      if (res.status === 404) return new Response('Not found', { status: 404 });
      if (!res.ok) return jsonResponse({ error: `讀取物件失敗 (${res.status})` }, res.status);
      const raw = await res.text();
      return new Response(raw, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'private, max-age=300',
        },
      });
    }

    if (pathname === '/api/sync/tree' && request.method === 'GET') {
      const ref = url.searchParams.get('ref') ?? '';
      if (!/^[a-f0-9]{7,64}$/i.test(ref)) {
        return jsonResponse({ error: '必須指定明確的 Git commit SHA ref' }, 400);
      }
      const commitRes = await ghFetch(`/repos/${owner}/${repo}/git/commits/${ref}`, token);
      if (!commitRes.ok) return jsonResponse({ error: '找不到指定 commit' }, commitRes.status);
      const commitObj = (await commitRes.json()) as { tree: { sha: string } };
      const treeRes = await ghFetch(
        `/repos/${owner}/${repo}/git/trees/${commitObj.tree.sha}?recursive=1`,
        token
      );
      if (!treeRes.ok) return jsonResponse({ error: '無法讀取 Git tree' }, treeRes.status);
      const treeJson = (await treeRes.json()) as {
        tree: Array<{ path: string; type: string; size?: number }>;
      };
      const files = treeJson.tree
        .filter((item) => item.type === 'blob' && item.path.startsWith(`${STUDY_DATA_PREFIX}/`))
        .map((item) => ({ path: item.path, sizeBytes: item.size ?? 0 }));
      return jsonResponse({ files });
    }

    if (pathname === '/api/sync/publish' && request.method === 'POST') {
      if (!isOriginAllowed(request, env) || request.headers.get('x-mooncode-csrf') !== '1') {
        return jsonResponse({ error: 'CSRF 或來源網域驗證失敗' }, 403);
      }

      const rawBody = await request.text();
      if (new TextEncoder().encode(rawBody).byteLength > MAX_PUBLISH_BYTES) {
        return jsonResponse({ error: '單次同步封包超過 4MB 上限，請改用分批同步。' }, 413);
      }

      let body: {
        expectedParentCommitSha: string | null;
        message: string;
        blobsToUpsert: Array<{ path: string; contentUtf8: string }>;
        pathsToDelete?: string[];
      };
      try {
        body = JSON.parse(rawBody);
      } catch {
        return jsonResponse({ error: '無效的 JSON 請求體' }, 400);
      }

      if ((body.blobsToUpsert?.length ?? 0) > MAX_BLOBS_PER_COMMIT) {
        return jsonResponse({ error: `單次提交物件數不可超過 ${MAX_BLOBS_PER_COMMIT}` }, 400);
      }

      try {
        for (const b of body.blobsToUpsert ?? []) assertSafeStudyDataPath(b.path);
        for (const d of body.pathsToDelete ?? []) assertSafeStudyDataPath(d);
      } catch (e) {
        return jsonResponse({ error: (e as Error).message }, 400);
      }

      if (!body.expectedParentCommitSha) {
        return jsonResponse({ error: '缺少預期 parent commit SHA，禁止盲目初始化覆蓋遠端。' }, 400);
      }

      const parentCommitRes = await ghFetch(
        `/repos/${owner}/${repo}/git/commits/${body.expectedParentCommitSha}`,
        token
      );
      if (!parentCommitRes.ok) {
        return jsonResponse({ error: '找不到預期的 parent commit' }, parentCommitRes.status);
      }
      const parentCommit = (await parentCommitRes.json()) as { tree: { sha: string } };

      const treeItems: Array<{
        path: string;
        mode: string;
        type: 'blob';
        sha: string | null;
      }> = [];

      for (const blob of body.blobsToUpsert ?? []) {
        const blobRes = await ghFetch(`/repos/${owner}/${repo}/git/blobs`, token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: blob.contentUtf8, encoding: 'utf-8' }),
        });
        if (blobRes.status === 403 || blobRes.status === 429) {
          return jsonResponse(
            { error: '觸發 GitHub API 限流', retryAfterMs: parseRateLimitRetryMs(blobRes) },
            429
          );
        }
        if (!blobRes.ok) {
          return jsonResponse({ error: `建立 Git blob 失敗 (${blobRes.status})` }, blobRes.status);
        }
        const blobObj = (await blobRes.json()) as { sha: string };
        treeItems.push({ path: blob.path, mode: '100644', type: 'blob', sha: blobObj.sha });
      }

      for (const delPath of body.pathsToDelete ?? []) {
        treeItems.push({ path: delPath, mode: '100644', type: 'blob', sha: null });
      }

      const newTreeRes = await ghFetch(`/repos/${owner}/${repo}/git/trees`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base_tree: parentCommit.tree.sha, tree: treeItems }),
      });
      if (!newTreeRes.ok) {
        return jsonResponse({ error: `建立 Git tree 失敗 (${newTreeRes.status})` }, newTreeRes.status);
      }
      const newTree = (await newTreeRes.json()) as { sha: string };

      const commitRes = await ghFetch(`/repos/${owner}/${repo}/git/commits`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: body.message || 'MoonCode study-data update',
          tree: newTree.sha,
          parents: [body.expectedParentCommitSha],
        }),
      });
      if (!commitRes.ok) {
        return jsonResponse({ error: `建立 Git commit 失敗 (${commitRes.status})` }, commitRes.status);
      }
      const newCommit = (await commitRes.json()) as { sha: string };

      // Fast-forward ONLY: force: false
      const refUpdateRes = await ghFetch(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, token, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sha: newCommit.sha, force: false }),
      });

      if (refUpdateRes.status === 409 || refUpdateRes.status === 422) {
        const errText = await refUpdateRes.text();
        const isFastForwardConflict =
          refUpdateRes.status === 409 || errText.toLowerCase().includes('fast forward');
        return jsonResponse(
          {
            error: `分支更新衝突 (${refUpdateRes.status})：${errText.slice(0, 150)}`,
            isConflict: isFastForwardConflict,
          },
          refUpdateRes.status
        );
      }
      if (!refUpdateRes.ok) {
        return jsonResponse(
          { error: `更新遠端分支參考失敗 (${refUpdateRes.status})` },
          refUpdateRes.status
        );
      }

      return jsonResponse({ newCommitSha: newCommit.sha });
    }
  }

  return jsonResponse({ error: '找不到對應的 API 路徑' }, 404);
}
