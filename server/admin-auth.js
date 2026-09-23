import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const COOKIE_NAME = '__Host-woori_admin';
export const SESSION_SECONDS = 2 * 60 * 60;
const MAX_BODY_BYTES = 4096;
const ROLES = new Set(['superadmin', 'parking', 'space']);
const TEAM_ROLES = new Set(['parking', 'space']);
const ALL_STATES = new Set(['checking', 'closed', 'available', 'busy', 'full', 'school_open', 'gym_open', 'hall_open', 'hall_closed']);
const ACCESS_STATES = new Set(['checking', 'closed', 'school_open', 'gym_open', 'hall_open', 'hall_closed']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USERNAME = /^[A-Za-z0-9_-]{1,80}$/;

function config(env) {
  const bootstrapUsername = (env.ADMIN_LOGIN_ID || '').trim().toUpperCase();
  const bootstrapPasswordHash = env.ADMIN_PASSWORD_SCRYPT || '';
  const sessionSecret = env.ADMIN_SESSION_SECRET || '';
  const supabaseUrl = (env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  let origin;
  try { origin = new URL(env.ADMIN_ALLOWED_ORIGIN || '').origin; } catch { return null; }
  const invalidBootstrap = (bootstrapUsername && !USERNAME.test(bootstrapUsername))
    || (bootstrapPasswordHash && !/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/.test(bootstrapPasswordHash));
  if (invalidBootstrap || !/^[A-Za-z0-9_-]{64,}$/.test(sessionSecret) || !/^https:\/\//.test(supabaseUrl) || serviceKey.length < 30 || !origin.startsWith('https://')) return null;
  return { bootstrapUsername, bootstrapPasswordHash, sessionSecret, supabaseUrl, serviceKey, origin };
}
function safeEqual(a, b) { return timingSafeEqual(createHash('sha256').update(String(a)).digest(), createHash('sha256').update(String(b)).digest()); }
function reply(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Vary', 'Cookie, Origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}
function publicReply(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', status === 200 ? 'public, max-age=0, s-maxage=10' : 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}
function cookie(value, age) { return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`; }
function clearSession(res) { res.setHeader('Set-Cookie', cookie('', 0)); }
function issueToken(session, secret, now) {
  const payload = Buffer.from(JSON.stringify({ v: 2, sid: session.id, sub: session.username, cv: session.credentialVersion, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + SESSION_SECONDS, nonce: randomBytes(24).toString('base64url') })).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}
export function readSession(req, cfg, now = Date.now()) {
  const header = req.headers?.cookie || '';
  if (typeof header !== 'string' || header.length > 8192) return null;
  const values = header.split(';').map((part) => part.trim()).filter((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (values.length !== 1) return null;
  const [encoded, signature, ...extra] = values[0].slice(COOKIE_NAME.length + 1).split('.');
  if (extra.length || !encoded || !/^[A-Za-z0-9_-]+$/.test(encoded) || !/^[A-Za-z0-9_-]{43}$/.test(signature || '')) return null;
  if (!safeEqual(signature, createHmac('sha256', cfg.sessionSecret).update(encoded).digest('base64url'))) return null;
  try {
    const value = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    const seconds = Math.floor(now / 1000);
    if (value.v !== 2 || !UUID.test(value.sid || '') || typeof value.sub !== 'string' || !Number.isSafeInteger(value.cv) || !Number.isSafeInteger(value.iat) || !Number.isSafeInteger(value.exp) || value.iat > seconds + 30 || value.exp <= seconds || value.exp - value.iat !== SESSION_SECONDS || !/^[A-Za-z0-9_-]{32}$/.test(value.nonce || '')) return null;
    return { id: value.sid, username: value.sub, credentialVersion: value.cv, expiresAt: new Date(value.exp * 1000).toISOString() };
  } catch { return null; }
}
async function jsonBody(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type'] || '')) throw new Error('unsupported');
  if (Number(req.headers?.['content-length'] || 0) > MAX_BODY_BYTES) throw new Error('large');
  let value = req.body;
  if (value === undefined) {
    let raw = '';
    for await (const chunk of req) { raw += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk); if (Buffer.byteLength(raw) > MAX_BODY_BYTES) throw new Error('large'); }
    value = raw;
  }
  if (Buffer.isBuffer(value)) value = value.toString('utf8');
  if (typeof value === 'string') value = JSON.parse(value);
  if (!value || typeof value !== 'object' || Array.isArray(value) || Buffer.byteLength(JSON.stringify(value)) > MAX_BODY_BYTES) throw new Error('body');
  return value;
}
async function rpc(cfg, name, args, fetcher = fetch) {
  const response = await fetcher(`${cfg.supabaseUrl}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: cfg.serviceKey, Authorization: `Bearer ${cfg.serviceKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  let data = null;
  try { data = await response.json(); } catch { /* fail closed */ }
  if (!response.ok) { const error = new Error('database unavailable'); error.status = response.status; throw error; }
  return data;
}
function hashPassword(password) { const salt = randomBytes(16); return `scrypt$${salt.toString('hex')}$${scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString('hex')}`; }
function verifyPassword(password, encoded) { try { const [, salt, hash] = String(encoded).split('$'); return timingSafeEqual(scryptSync(password, Buffer.from(salt, 'hex'), 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }), Buffer.from(hash, 'hex')); } catch { return false; } }
function exactPath(req, action) { try { return new URL(req.url || '', 'https://internal.invalid').pathname === `/api/admin/${action}`; } catch { return false; } }
function accountView(account, session) {
  return {
    authenticated: true,
    username: account.username,
    role: account.role,
    displayName: session.displayName,
    expiresAt: session.expiresAt,
    sessionId: session.label,
    capabilities: { liveOperations: true, photoReview: false, prayerInbox: false, sharingModeration: false },
  };
}
function validLogin(body) { return typeof body.username === 'string' && USERNAME.test(body.username.trim()) && typeof body.password === 'string' && body.password.length >= 1 && body.password.length <= 256 && typeof body.displayName === 'string' && body.displayName.trim().length >= 1 && body.displayName.trim().length <= 30; }
function validOperation(body) { return typeof body.resourceId === 'string' && ALL_STATES.has(body.state) && Number.isInteger(body.expectedVersion) && body.expectedVersion >= 0 && typeof body.requestId === 'string' && UUID.test(body.requestId) && (body.resourceId === 'space.songrim.access' ? ACCESS_STATES.has(body.state) : !ACCESS_STATES.has(body.state) || body.state === 'checking' || body.state === 'closed'); }
function validAccount(body) { return typeof body.username === 'string' && USERNAME.test(body.username.trim()) && typeof body.displayLabel === 'string' && body.displayLabel.trim().length >= 1 && body.displayLabel.trim().length <= 30 && TEAM_ROLES.has(body.role) && typeof body.active === 'boolean' && (body.password === undefined || (typeof body.password === 'string' && body.password.length >= 4 && body.password.length <= 256)); }
async function protectedSession(req, res, cfg, fetcher, now) {
  const token = readSession(req, cfg, now);
  if (!token) { clearSession(res); return null; }
  try {
    const session = await rpc(cfg, 'ops_get_session', { p_session_id: token.id }, fetcher);
    if (!session || session.username !== token.username || session.credentialVersion !== token.credentialVersion || !ROLES.has(session.role)) { clearSession(res); return null; }
    return { ...session, expiresAt: token.expiresAt, tokenId: token.id };
  } catch { clearSession(res); return 'dbdown'; }
}
export async function handleAdmin(action, req, res, env = process.env, now = Date.now(), fetcher = fetch) {
  const fixedMethod = { login: 'POST', logout: 'POST', session: 'GET', dashboard: 'GET' }[action];
  if ((!fixedMethod && !['operations', 'accounts'].includes(action)) || !exactPath(req, action)) return reply(res, 404, { error: '찾을 수 없는 요청입니다.' });
  if (!['GET', 'POST'].includes(req.method) || (fixedMethod && req.method !== fixedMethod)) {
    res.setHeader('Allow', fixedMethod || 'GET, POST');
    return reply(res, 405, { error: '허용되지 않은 요청입니다.' });
  }
  const cfg = config(env);
  if (!cfg) { clearSession(res); return reply(res, 503, { authenticated: false, error: '관리자 인증 설정을 확인 중입니다.' }); }
  if (req.method === 'POST' && (req.headers?.origin !== cfg.origin || req.headers?.['sec-fetch-site'] === 'cross-site')) return reply(res, 403, { authenticated: false, error: '같은 사이트에서 다시 시도해주세요.' });
  if (req.method === 'GET' && req.headers?.['sec-fetch-site'] === 'cross-site') return reply(res, 403, { authenticated: false, error: '허용되지 않은 요청입니다.' });

  if (action === 'login') return login(req, res, cfg, now, fetcher);
  if (action === 'logout') return logout(req, res, cfg, now, fetcher);

  const session = await protectedSession(req, res, cfg, fetcher, now);
  if (session === 'dbdown') return reply(res, 503, { authenticated: false, error: '관리자 인증을 확인하지 못했습니다.' });
  if (!session) return reply(res, 401, { authenticated: false, error: '관리자 로그인이 필요합니다.' });
  const identity = accountView(session, { displayName: session.displayName, expiresAt: session.expiresAt, label: session.label });
  if (action === 'session') return reply(res, 200, identity);
  if (action === 'dashboard') return reply(res, 200, identity);
  if (action === 'operations') return operations(req, res, cfg, session, fetcher);
  return accounts(req, res, cfg, session, fetcher);
}
async function login(req, res, cfg, now, fetcher) {
  let body;
  try { body = await jsonBody(req); } catch { return reply(res, 400, { authenticated: false, error: '로그인 요청을 확인해주세요.' }); }
  if (!validLogin(body)) return reply(res, 400, { authenticated: false, error: '아이디, 비밀번호, 표시 이름을 확인해주세요.' });
  const username = body.username.trim().toUpperCase();
  const displayName = body.displayName.trim();
  try {
    await rpc(cfg, 'ops_bootstrap_superadmin', { p_username: cfg.bootstrapUsername || null, p_password_hash: cfg.bootstrapPasswordHash || null }, fetcher);
    const reserved = await rpc(cfg, 'ops_reserve_login', { p_username: username }, fetcher);
    if (!reserved || reserved.status === 'invalid') { clearSession(res); return reply(res, 401, { authenticated: false, error: '아이디 또는 비밀번호를 확인해주세요.' }); }
    if (reserved.status === 'limited') { res.setHeader('Retry-After', String(reserved.retryAfter)); return reply(res, 429, { authenticated: false, error: '로그인 시도가 많습니다. 잠시 후 다시 시도해주세요.', retryAfter: reserved.retryAfter }); }
    if (reserved.status !== 'reserved' || !Number.isSafeInteger(reserved.credentialVersion) || !UUID.test(reserved.reservationId || '') || !verifyPassword(body.password, reserved.passwordHash)) {
      if (reserved.status === 'reserved' && UUID.test(reserved.reservationId || '')) await rpc(cfg, 'ops_finish_login', { p_username: username, p_reservation_id: reserved.reservationId, p_success: false, p_expected_credential_version: reserved.credentialVersion }, fetcher);
      clearSession(res);
      return reply(res, 401, { authenticated: false, error: '아이디 또는 비밀번호를 확인해주세요.' });
    }
    const expiresAt = new Date((Math.floor(now / 1000) + SESSION_SECONDS) * 1000).toISOString();
    const session = await rpc(cfg, 'ops_finish_login', { p_username: username, p_reservation_id: reserved.reservationId, p_success: true, p_display_name: displayName, p_session_label: `S-${randomBytes(5).toString('hex').toUpperCase()}`, p_expires_at: expiresAt, p_expected_credential_version: reserved.credentialVersion }, fetcher);
    if (!session || !ROLES.has(session.role)) throw new Error('invalid session');
    res.setHeader('Set-Cookie', cookie(issueToken(session, cfg.sessionSecret, now), SESSION_SECONDS));
    return reply(res, 200, accountView(session, { displayName, expiresAt, label: session.label }));
  } catch { clearSession(res); return reply(res, 503, { authenticated: false, error: '로그인을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.' }); }
}
async function logout(req, res, cfg, now, fetcher) {
  try { await jsonBody(req); } catch { return reply(res, 400, { error: '로그아웃 요청을 확인해주세요.' }); }
  const token = readSession(req, cfg, now);
  try { if (token) await rpc(cfg, 'ops_revoke_session', { p_session_id: token.id }, fetcher); } catch { clearSession(res); return reply(res, 503, { error: '로그아웃을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.' }); }
  clearSession(res);
  return reply(res, 200, { authenticated: false });
}
async function operations(req, res, cfg, session, fetcher) {
  try {
    if (req.method === 'GET') return reply(res, 200, await rpc(cfg, 'ops_list_operations', { p_session_id: session.tokenId }, fetcher));
    const body = await jsonBody(req);
    if (!validOperation(body)) return reply(res, 400, { error: '운영 상태 요청을 확인해주세요.' });
    const data = await rpc(cfg, 'ops_set_resource_state', { p_session_id: session.tokenId, p_resource_id: body.resourceId, p_state: body.state, p_expected_version: body.expectedVersion, p_request_id: body.requestId }, fetcher);
    if (data?.status === 'conflict') return reply(res, 409, { error: '다른 변경이 먼저 반영되었습니다.', resource: data.resource });
    if (data?.status === 'payload_mismatch') return reply(res, 409, { error: '같은 요청 ID가 다른 요청에 사용되었습니다.' });
    if (!data?.resource) throw new Error('bad RPC result');
    return reply(res, 200, { resource: data.resource });
  } catch (error) { return reply(res, error?.status === 403 ? 403 : 503, { error: error?.status === 403 ? '권한이 없습니다.' : '운영 상태를 처리하지 못했습니다. 잠시 후 다시 시도해주세요.' }); }
}
async function accounts(req, res, cfg, session, fetcher) {
  if (session.role !== 'superadmin') return reply(res, 403, { error: '권한이 없습니다.' });
  try {
    const listed = await rpc(cfg, 'ops_list_accounts', { p_session_id: session.tokenId }, fetcher);
    if (req.method === 'GET') return reply(res, 200, { accounts: listed });
    const body = await jsonBody(req);
    if (!validAccount(body)) return reply(res, 400, { error: '계정 정보를 확인해주세요.' });
    const username = body.username.trim().toUpperCase();
    // Defense in depth: do not send a known superadmin to the team-account RPC.
    if (listed.some((account) => account.username === username && account.role === 'superadmin')) return reply(res, 403, { error: '최고 관리자 계정은 여기서 변경할 수 없습니다.' });
    const account = await rpc(cfg, 'ops_upsert_account', { p_session_id: session.tokenId, p_username: username, p_role: body.role, p_display_label: body.displayLabel.trim(), p_password_hash: body.password === undefined ? null : hashPassword(body.password), p_active: body.active }, fetcher);
    return reply(res, 200, { account });
  } catch (error) { return reply(res, error?.status === 403 ? 403 : 503, { error: error?.status === 403 ? '권한이 없습니다.' : '계정을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.' }); }
}
export async function handlePublicStatus(req, res, env = process.env, fetcher = fetch) {
  let pathname;
  try { pathname = new URL(req.url || '', 'https://internal.invalid').pathname; } catch { return publicReply(res, 400, { enabled: false }); }
  if (pathname !== '/api/status' || req.method !== 'GET') return publicReply(res, req.method === 'GET' ? 404 : 405, { enabled: false });
  const cfg = config(env);
  if (!cfg) return publicReply(res, 503, { enabled: false });
  try { return publicReply(res, 200, { enabled: true, resources: await rpc(cfg, 'ops_public_resources', {}, fetcher) }); } catch { return publicReply(res, 503, { enabled: false }); }
}
