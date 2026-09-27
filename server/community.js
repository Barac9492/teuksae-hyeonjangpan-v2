import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { PNG } from 'pngjs';
import { readSession } from './admin-auth.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{32,128}$/;
const BUCKET = 'community-photos-v2';
const MAX = 3 * 1024 * 1024;
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = (status, message) => Object.assign(new Error(message), { status });
function config(env) {
  const origin = env.COMMUNITY_ALLOWED_ORIGIN || 'https://teuksae-hyeonjangpan-v2.vercel.app';
  let url; try { url = new URL(origin); } catch { throw fail(503, '서버 설정을 확인 중입니다.'); }
  if (url.origin !== origin || (url.protocol !== 'https:' && !(env.NODE_ENV === 'test' && url.hostname === 'localhost'))) throw fail(503, '서버 설정을 확인 중입니다.');
  if (!/^https:\/\//.test(env.SUPABASE_URL || '') || (env.SUPABASE_SERVICE_ROLE_KEY || '').length < 30 || (env.ADMIN_SESSION_SECRET || '').length < 64) throw fail(503, '서버 설정을 확인 중입니다.');
  return { origin, supabaseUrl: env.SUPABASE_URL.replace(/\/$/, ''), serviceKey: env.SUPABASE_SERVICE_ROLE_KEY, sessionSecret: env.ADMIN_SESSION_SECRET };
}
function reply(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Cookie, Origin');
  res.end(JSON.stringify(body));
}
async function body(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type'] || '')) throw fail(415, 'JSON 요청이 필요합니다.');
  const maxBody = 4 * 1024 * 1024 + 8192;
  if (Number(req.headers?.['content-length']) > maxBody) throw fail(413, '사진은 3MB 이하로 올려주세요.');
  let value = req.body;
  if (value === undefined) { const chunks = []; let length = 0; for await (const chunk of req) { const b = Buffer.from(chunk); length += b.length; if (length > maxBody) throw fail(413, '요청이 너무 큽니다.'); chunks.push(b); } value = Buffer.concat(chunks); }
  if (Buffer.isBuffer(value)) value = value.toString('utf8');
  try { if (typeof value === 'string') value = JSON.parse(value); } catch { throw fail(400, '요청을 확인해주세요.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || Buffer.byteLength(JSON.stringify(value)) > maxBody) throw fail(400, '요청을 확인해주세요.');
  return value;
}
export function sanitizePng(encoded) {
  if (typeof encoded !== 'string' || encoded.length > Math.ceil(MAX / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw fail(400, '3MB 이하 PNG 사진이 필요합니다.');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length > MAX || bytes.length < 33 || bytes.toString('base64') !== encoded || !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii',12,16) !== 'IHDR') throw fail(400, '올바른 PNG 사진이 필요합니다.');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (!width || !height || width > 4096 || height > 4096 || width * height > 4_000_000) throw fail(400, '사진 크기는 400만 화소 이하로 줄여주세요.');
  try { const decoded = PNG.sync.read(bytes, { checkCRC: true }); const clean = PNG.sync.write({ width: decoded.width, height: decoded.height, data: decoded.data }, { colorType: 6 }); if (clean.length > MAX) throw new Error('size'); return clean; } catch { throw fail(400, '사진을 읽지 못했습니다. 작은 PNG로 다시 시도해주세요.'); }
}
export async function handleCommunity(route, req, res, env = process.env, fetcher = fetch, now = Date.now()) {
  try {
    if (route === 'cleanup') {
      if (!env.CRON_SECRET) throw fail(503, '정리 작업 인증 설정이 필요합니다.');
      const supplied = req.headers?.authorization;
      if (typeof supplied !== 'string' || !timingSafeEqual(createHash('sha256').update(supplied).digest(), createHash('sha256').update('Bearer ' + env.CRON_SECRET).digest())) throw fail(401, '인증이 필요합니다.');
    }
    const cfg = config(env);
    const url = new URL(req.url, cfg.origin);
    if (url.pathname !== ({ public: '/api/community', photo: '/api/community/photo', admin: '/api/admin/community', cleanup: '/api/community/cleanup' })[route]) throw fail(404, '찾을 수 없습니다.');
    if (!['GET','POST'].includes(req.method) || (['photo','cleanup'].includes(route) && req.method !== 'GET')) throw fail(405, '허용되지 않은 요청입니다.');
    if ((req.method === 'POST' && req.headers?.origin !== cfg.origin) || req.headers?.['sec-fetch-site'] === 'cross-site' || (req.headers?.origin && req.headers.origin !== cfg.origin)) throw fail(403, '같은 사이트에서 다시 시도해주세요.');
    const headers = { apikey: cfg.serviceKey, Authorization: `Bearer ${cfg.serviceKey}`, 'Content-Type': 'application/json' };
    async function rpc(name, args) { const response = await fetcher(`${cfg.supabaseUrl}/rest/v1/rpc/${name}`, { method:'POST', headers, body:JSON.stringify(args) }); let data; try { data = await response.json(); } catch { throw fail(503, '서버 응답을 확인하지 못했습니다.'); } if (!response.ok) throw fail(response.status === 403 ? 403 : 503, '요청을 처리하지 못했습니다.'); if (data == null) throw fail(503, '서버 응답을 확인하지 못했습니다.'); return data; }
    async function moderator() { const token = readSession(req,cfg,now); if (!token) throw fail(401,'관리자 로그인이 필요합니다.'); const session = await rpc('ops_get_session',{p_session_id:token.id}); if (session.username !== token.username || session.credentialVersion !== token.credentialVersion || session.role !== 'superadmin') throw fail(403,'최고 관리자 권한이 필요합니다.'); return token.id; }
    const call = (action,args = {}) => rpc('community_v2',{p_action:action,p_args:args});
    async function cleanup(data) { if (data.cleanupPath) { const response = await fetcher(`${cfg.supabaseUrl}/storage/v1/object/${BUCKET}`, { method:'DELETE',headers,body:JSON.stringify({prefixes:[data.cleanupPath]}) }); if (!response.ok) throw fail(503,'삭제 처리 중입니다. 다시 시도해주세요.'); } const clean = {...data}; delete clean.cleanupPath; delete clean.path; delete clean.ready; return clean; }
    function checked(data) { const statuses = { conflict:409, payload_mismatch:409, limited:429, missing:404, forbidden:403 }; if (statuses[data.status]) throw fail(statuses[data.status], '요청을 처리하지 못했습니다. 잠시 후 확인해주세요.'); return data; }
    if (route === 'cleanup') {
      const data = await call('cleanupCandidates');
      if (!Array.isArray(data.items)) throw fail(503, '정리 목록을 확인하지 못했습니다.');
      let cleaned = 0, failed = 0;
      for (const item of data.items) {
        try {
          await cleanup({ cleanupPath: item.path });
          checked(await call('cleanupComplete', { id: item.id, path: item.path }));
          cleaned++;
        } catch { failed++; }
      }
      return reply(res, failed ? 503 : 200, { cleaned, failed });
    }
    if (route === 'photo') {
      const id = url.searchParams.get('id'); if (!UUID.test(id || '')) throw fail(400,'사진 ID를 확인해주세요.');
      let session = null;
      let data = await call('photo',{id,session});
      if (data.status === 'missing' && readSession(req,cfg,now)) {
        session = await moderator();
        data = await call('photo',{id,session});
      }
      checked(data);
      const response = await fetcher(`${cfg.supabaseUrl}/storage/v1/object/authenticated/${BUCKET}/${data.path}`,{headers});
      if (!response.ok) throw fail(503,'사진을 읽지 못했습니다.');
      // Recheck visibility after storage read, so a moderation/delete race cannot expose a stale read.
      checked(await call('photo',{id,session}));
      res.statusCode=200; res.setHeader('Content-Type','image/png'); res.setHeader('Cache-Control','private, no-store'); res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Vary','Cookie, Origin'); return res.end(Buffer.from(await response.arrayBuffer()));
    }
    if (route === 'admin') {
      const session = await moderator();
      if (req.method === 'GET') return reply(res,200,await call('adminList',{session}));
      const b = await body(req);
      if (!UUID.test(b.id || '') || !['approved','rejected','deleted'].includes(b.decision) || !Number.isSafeInteger(b.expectedVersion) || b.expectedVersion < 0) throw fail(400,'검토 요청을 확인해주세요.');
      return reply(res,200,await cleanup(checked(await call('moderate',{...b,session}))));
    }
    if (req.method === 'GET') { const kind = url.searchParams.get('kind'); if (!['prayer','photo'].includes(kind)) throw fail(400,'종류를 확인해주세요.'); return reply(res,200,await call('list',{kind})); }
    const b = await body(req);
    if (b.action) { if (!['delete','status'].includes(b.action) || !UUID.test(b.id || '') || !TOKEN.test(b.deleteToken || '')) throw fail(400,'요청을 확인해주세요.'); return reply(res,200,await cleanup(checked(await call(b.action,{id:b.id,tokenHash:hash(b.deleteToken)})))); }
    // Vercel's platform-controlled header, never arbitrary X-Forwarded-For. Missing IP shares a conservative bucket.
    const ip = String(req.headers?.['x-vercel-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
    const ipHash = createHmac('sha256',cfg.sessionSecret).update(`community-ip:${ip}`).digest('hex');
    checked(await call('preflight',{ipHash}));
    if (!UUID.test(b.requestId || '') || !['prayer','photo'].includes(b.kind) || typeof b.text !== 'string' || b.text.trim().length > (b.kind === 'prayer' ? 600 : 40) || (b.kind === 'prayer' && !b.text.trim()) || b.consent !== true || !TOKEN.test(b.deleteToken || '') || !(b.eventDay === null || (Number.isInteger(b.eventDay) && b.eventDay >= 0 && b.eventDay <= 5)) || (b.kind === 'prayer' && b.imageBase64 !== undefined)) throw fail(400,'내용과 공개 동의를 확인해주세요.');
    const image = b.kind === 'photo' ? sanitizePng(b.imageBase64) : null;
    const tokenHash = hash(b.deleteToken);
    const payloadHash = hash(JSON.stringify([b.kind,b.text.trim(),b.eventDay,true,image ? hash(image) : null]));

    const data = checked(await call('submit',{id:b.requestId.toLowerCase(),kind:b.kind,text:b.text.trim(),eventDay:b.eventDay,tokenHash,payloadHash,ipHash}));
    if (image && !data.ready && data.status === 'pending') {
      const response = await fetcher(`${cfg.supabaseUrl}/storage/v1/object/${BUCKET}/${data.path}`,{method:'POST',headers:{...headers,'Content-Type':'image/png','x-upsert':'false'},body:image});
      if (!response.ok && response.status !== 409) { let problem; try { problem=await response.json(); } catch { /* fail closed */ } if (problem?.statusCode !== '409' && problem?.error !== 'Duplicate') throw fail(503,'사진 전송을 완료하지 못했습니다. 같은 요청으로 다시 시도해주세요.'); }
      return reply(res,200,await cleanup(checked(await call('finish',{id:b.requestId.toLowerCase(),tokenHash,payloadHash}))));
    }
    return reply(res,200,await cleanup(data));
  } catch (error) { return reply(res,error.status || 503,{error:error.status ? error.message : '서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.'}); }
}
