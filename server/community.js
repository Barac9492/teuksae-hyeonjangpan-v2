import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { PRAYER_MASK_VERSION, PUBLIC_REVIEW_VERSION, validPublicPrayer, prayerMask, adminPrayerItem } from './prayer-masking.js';
import { PNG } from 'pngjs';
import { readSession } from './admin-auth.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{32,128}$/;
const BUCKET = 'community-photos-v2';
const MAX = 3 * 1024 * 1024;
const ADMIN_STATUSES = ['all','pending','approved','rejected','trashed','mask_review','archived'];
// Preserve PostgreSQL microseconds in cursor timestamps; Date.toISOString would
// round them and skip same-millisecond rows at a page boundary.
const CURSOR_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = (status, message) => Object.assign(new Error(message), { status });
function validAdminCursor(cursor, status, kind = 'all') {
  return cursor && typeof cursor === 'object' && !Array.isArray(cursor)
    && Object.keys(cursor).length === (kind === 'all' ? 5 : 6) && (cursor.kind ?? 'all') === kind
    && cursor.v === 1 && cursor.status === status && [0,1].includes(cursor.priority)
    && (status === 'all' || cursor.priority === (['pending','mask_review'].includes(status) ? 0 : 1))
    && typeof cursor.id === 'string' && UUID.test(cursor.id) && typeof cursor.createdAt === 'string'
    && CURSOR_TIME.test(cursor.createdAt) && Number.isFinite(Date.parse(cursor.createdAt));
}
function adminPageArgs(search) {
  const status = search.get('status') ?? 'all';
  const kind = search.get('kind') ?? 'all';
  if (!['all','prayer','photo'].includes(kind) || search.getAll('kind').length > 1) throw fail(400,'종류를 확인해주세요.');
  if (!ADMIN_STATUSES.includes(status) || search.getAll('status').length > 1 || search.getAll('cursor').length > 1) throw fail(400,'검토 목록 조건을 확인해주세요.');
  const encoded = search.get('cursor');
  if (encoded === null) return {status,...kind !== 'all' ? {kind} : {}};
  if (!/^[A-Za-z0-9_-]{1,1024}$/.test(encoded)) throw fail(400,'검토 목록 위치를 확인해주세요.');
  let cursor;
  try {
    const bytes = Buffer.from(encoded,'base64url');
    if (bytes.toString('base64url') !== encoded) throw new Error('encoding');
    cursor = JSON.parse(bytes.toString('utf8'));
  } catch { throw fail(400,'검토 목록 위치를 확인해주세요.'); }
  if (!validAdminCursor(cursor,status,kind)) throw fail(400,'검토 목록 위치를 확인해주세요.');
  return {status,cursor,...kind !== 'all' ? {kind} : {}};
}
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
// Public serialization is an allowlist. Originals and review metadata never cross it.
export function filterPublicCommunity(body) {
  if (!body || typeof body !== 'object') return body;
  if (!Array.isArray(body.items)) {
    return Object.fromEntries(['id','status','version','photoCountToday','today','deleted','publicationHeld'].filter(key => Object.hasOwn(body,key)).map(key => [key,body[key]]));
  }
  const items = body.items.filter(item => item?.kind !== 'prayer' ||
    (body.maskingPolicyVersion === PRAYER_MASK_VERSION && typeof item.text === 'string' && !prayerMask(item.text).required));
  return { enabled:body.enabled, items:items.map(item => Object.fromEntries(
    ['id','kind','text','createdAt','eventDay',...(item.kind === 'photo' ? ['photoUrl'] : [])].filter(key => Object.hasOwn(item,key)).map(key => [key,item[key]])
  )), photoCountToday:body.photoCountToday, today:body.today,
  ...(Object.hasOwn(body,'nextCursor') ? {nextCursor:body.nextCursor == null ? null : {createdAt:body.nextCursor.createdAt,id:body.nextCursor.id}} : {}) };
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
    // Public and admin actions always use the same operational data.
    const bucketFor = (scope = false) => scope ? `rehearsal-${BUCKET}` : BUCKET;
    const publicView = filterPublicCommunity;
    const url = new URL(req.url, cfg.origin);
    if (url.pathname !== ({ public: '/api/community', photo: '/api/community/photo', admin: '/api/admin/community', cleanup: '/api/community/cleanup' })[route]) throw fail(404, '찾을 수 없습니다.');
    if (!['GET','POST'].includes(req.method) || (['photo','cleanup'].includes(route) && req.method !== 'GET')) throw fail(405, '허용되지 않은 요청입니다.');
    if ((req.method === 'POST' && req.headers?.origin !== cfg.origin) || req.headers?.['sec-fetch-site'] === 'cross-site' || (req.headers?.origin && req.headers.origin !== cfg.origin)) throw fail(403, '같은 사이트에서 다시 시도해주세요.');
    const headers = { apikey: cfg.serviceKey, Authorization: `Bearer ${cfg.serviceKey}`, 'Content-Type': 'application/json' };
    async function rpc(name, args, scope = false) { const response = await fetcher(`${cfg.supabaseUrl}/rest/v1/rpc/${scope ? `rehearsal_${name}` : name}`, { method:'POST', headers, body:JSON.stringify(args) }); let data; try { data = await response.json(); } catch { throw fail(503, '서버 응답을 확인하지 못했습니다.'); } if (!response.ok) throw fail(response.status === 403 ? 403 : 503, '요청을 처리하지 못했습니다.'); if (data == null) throw fail(503, '서버 응답을 확인하지 못했습니다.'); return data; }
    async function moderator() { const token = readSession(req,cfg,now); if (!token) throw fail(401,'관리자 로그인이 필요합니다.'); const session = await rpc('ops_get_session',{p_session_id:token.id}); if (session.username !== token.username || session.credentialVersion !== token.credentialVersion || session.role !== 'superadmin') throw fail(403,'최고 관리자 권한이 필요합니다.'); return token.id; }
    const call = (action,args = {},scope = false) => rpc('community_v2',{p_action:action,p_args:args},scope);
    async function cleanup(data, scope = false) { if (data.cleanupPath) { const response = await fetcher(`${cfg.supabaseUrl}/storage/v1/object/${bucketFor(scope)}`, { method:'DELETE',headers,body:JSON.stringify({prefixes:[data.cleanupPath]}) }); if (!response.ok) throw fail(503,'삭제 처리 중입니다. 다시 시도해주세요.'); } const clean = {...data}; delete clean.cleanupPath; delete clean.path; delete clean.ready; return clean; }
    function checked(data) { const statuses = { conflict:409, preview_changed:409, mask_review_required:409, payload_mismatch:409, limited:429, missing:404, forbidden:403 }; if (statuses[data.status]) throw fail(statuses[data.status], '요청을 처리하지 못했습니다. 잠시 후 확인해주세요.'); return data; }
    if (route === 'cleanup') {
      let cleaned = 0, failed = 0;
      // Rehearsal tombstones remain eligible after the automatic event cutover.
      for (const scope of env.REHEARSAL_ENABLED === 'true' ? [false, true] : [false]) {
        const data = await call('cleanupCandidates', {}, scope);
        if (!Array.isArray(data.items)) throw fail(503, '정리 목록을 확인하지 못했습니다.');
        for (const item of data.items) {
          try {
            await cleanup({ cleanupPath: item.path }, scope);
            checked(await call('cleanupComplete', { id: item.id, path: item.path }, scope));
            cleaned++;
          } catch { failed++; }
        }
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
      // Photo visibility is governed entirely by the RPC's moderation status (pending/approved/
      // rejected/deleted/trashed/archived), not by public date eligibility. A pending item already required a
      // revalidated moderator session above.
      const response = await fetcher(`${cfg.supabaseUrl}/storage/v1/object/authenticated/${bucketFor()}/${data.path}`,{headers});
      if (!response.ok) throw fail(503,'사진을 읽지 못했습니다.');
      const bytes = Buffer.from(await response.arrayBuffer());
      // Recheck moderation visibility after storage read (second check), in case status changed
      // (e.g. approval revoked) between the first check and the storage fetch.
      checked(await call('photo',{id,session}));

      res.statusCode=200; res.setHeader('Content-Type','image/png'); res.setHeader('Cache-Control','private, no-store'); res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Vary','Cookie, Origin'); return res.end(bytes);
    }
    if (route === 'admin') {
      const session = await moderator();
      if (req.method === 'GET' && url.searchParams.has('view')) {
        if (url.searchParams.get('view') !== 'audit' || [...url.searchParams.keys()].some(k => k !== 'view') || url.searchParams.getAll('view').length > 1) throw fail(400,'요청을 확인해주세요.');
        let data;
        // A pre-migration RPC rejects the unknown action; report that as a pending DB update.
        try { data = await call('auditList',{session}); } catch (e) { if (e?.status === 403) throw e; throw fail(503,'승인 기록 DB 업데이트가 필요합니다.'); }
        if (data.attribution !== true || !Array.isArray(data.items) || data.items.length > 100) throw fail(503,'승인 기록을 확인하지 못했습니다.');
        return reply(res,200,{items:data.items});
      }
      if (req.method === 'GET') {
        const args = adminPageArgs(url.searchParams);
        const data = await call('adminList',{session,...args});
        if ((args.kind && data.kind !== args.kind) || (args.status === 'trashed' && !data.trashSupported) || (args.status === 'archived' && data.archiveSupported !== true)) throw fail(503,'검토 목록 DB 업데이트가 필요합니다.');
        // A pre-011 RPC ignores these arguments. Do not silently claim a filter
        // or next page was applied if the database has not been migrated yet.
        if (data.nextCursor === undefined && (args.status !== 'all' || args.cursor)) throw fail(503,'검토 목록 업데이트가 필요합니다. 잠시 후 다시 시도해주세요.');
        if (!Array.isArray(data.items) || data.items.length > (args.kind || ['trashed','archived'].includes(args.status) ? 20 : 100) || (data.nextCursor != null && !validAdminCursor(data.nextCursor,args.status,args.kind))) throw fail(503,'검토 목록을 확인하지 못했습니다.');
        // Old API callers can ignore this field. Never expose the SQL cursor as
        // an object: browsers treat this bounded opaque token as a page pointer.
        const nextCursor = data.nextCursor == null ? null : Buffer.from(JSON.stringify(data.nextCursor)).toString('base64url');
        return reply(res,200,{...data, nextCursor, items:data.items.filter(item => item?.status !== 'deleted').map(item => adminPrayerItem(item, data.maskingPolicyVersion === PRAYER_MASK_VERSION, data.publicReviewVersion === PUBLIC_REVIEW_VERSION))});
      }
      const b = await body(req);
      const reviewFields = () => ({id:b.id,expectedVersion:b.expectedVersion,publicationMode:b.publicationMode,reviewedPublicText:b.reviewedPublicText,sourceHash:b.sourceHash,maskPolicyVersion:b.maskPolicyVersion,publicReviewVersion:PUBLIC_REVIEW_VERSION});
      const validReview = () => UUID.test(b.id || '') && Number.isSafeInteger(b.expectedVersion) && b.expectedVersion >= 0 && ['auto','manual'].includes(b.publicationMode) && validPublicPrayer(b.reviewedPublicText) && /^[0-9a-f]{64}$/.test(b.sourceHash || '') && b.maskPolicyVersion === PRAYER_MASK_VERSION;
      const signReview = (fields,expires) => createHmac('sha256',cfg.sessionSecret).update(JSON.stringify({purpose:'prayer-publication',session,expires,...fields})).digest('hex');
      if (b.action === 'publicationPreview') {
        if (!validReview()) throw fail(400,'공개 문구와 지정 표현을 확인해주세요.');
        const policy = await call('maskPolicy');
        if (policy.version !== PRAYER_MASK_VERSION || policy.publicReviewVersion !== PUBLIC_REVIEW_VERSION) throw fail(503,'공개 문구 검토 DB 업데이트가 필요합니다.');
        const fields = reviewFields();
        const preview = checked(await call('publicationPreview',{session,...fields}));
        if (Object.keys(fields).some(key => preview[key] !== fields[key])) throw fail(409,'공개 미리보기를 새로 확인해주세요.');
        const expires = now + 10 * 60 * 1000;
        return reply(res,200,{...fields,previewExpires:expires,previewToken:signReview(fields,expires)});
      }
      if (b.decision === 'reviewed_approved') {
        if (!validReview() || !Number.isSafeInteger(b.previewExpires) || b.previewExpires <= now || b.previewExpires > now + 10 * 60 * 1000 || !/^[0-9a-f]{64}$/.test(b.previewToken || '') || !timingSafeEqual(Buffer.from(b.previewToken,'hex'),Buffer.from(signReview(reviewFields(),b.previewExpires),'hex'))) throw fail(409,'공개 미리보기를 새로 확인해주세요.');
        const policy = await call('maskPolicy');
        if (policy.version !== PRAYER_MASK_VERSION || policy.publicReviewVersion !== PUBLIC_REVIEW_VERSION) throw fail(503,'공개 문구 검토 DB 업데이트가 필요합니다.');
        return reply(res,200,checked(await call('moderate',{session,decision:'reviewed_approved',...reviewFields()})));
      }
      if (!UUID.test(b.id || '') || !['approved','masked_approved','rejected','deleted','trashed','restored','archived','unarchived'].includes(b.decision) || !Number.isSafeInteger(b.expectedVersion) || b.expectedVersion < 0) throw fail(400,'검토 요청을 확인해주세요.');
      if (['approved','masked_approved'].includes(b.decision)) {
        const policy = await call('maskPolicy');
        if (policy.version !== PRAYER_MASK_VERSION) throw fail(503,'가림 정책 DB 업데이트가 필요합니다.');
      }
      if (b.decision === 'masked_approved' && (b.maskPolicyVersion !== PRAYER_MASK_VERSION || typeof b.reviewedPublicText !== 'string' || b.reviewedPublicText.length > 600)) throw fail(409,'가림 미리보기를 새로 확인해주세요.');
      return reply(res,200,await cleanup(checked(await call('moderate',{id:b.id,decision:b.decision,expectedVersion:b.expectedVersion,session,
        ...(b.decision === 'masked_approved' ? {maskPolicyVersion:b.maskPolicyVersion,reviewedPublicText:b.reviewedPublicText} : {})}))));
    }
    if (req.method === 'GET') {
      const kind = url.searchParams.get('kind');
      if (!['prayer','photo','reflection'].includes(kind)) throw fail(400,'종류를 확인해주세요.');
      if (url.searchParams.get('page') !== '1') return reply(res,200,publicView(await call('list',{kind})));
      const beforeAt = url.searchParams.get('beforeAt'), beforeId = url.searchParams.get('beforeId');
      if ((beforeAt === null) !== (beforeId === null) || (beforeAt !== null && (!/^\d{4}-\d{2}-\d{2}T[0-9:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(beforeAt) || !Number.isFinite(Date.parse(beforeAt)) || !UUID.test(beforeId)))) throw fail(400,'페이지를 확인해주세요.');
      return reply(res,200,publicView(await rpc('community_public_page',{p_kind:kind,p_before_at:beforeAt,p_before_id:beforeId})));
    }
    const b = await body(req);
    if (b.action) { if (!['delete','status'].includes(b.action) || !UUID.test(b.id || '') || !TOKEN.test(b.deleteToken || '')) throw fail(400,'요청을 확인해주세요.'); return reply(res,200,publicView(await cleanup(checked(await call(b.action,{id:b.id,tokenHash:hash(b.deleteToken)}))))); }
    // Vercel's platform-controlled header, never arbitrary X-Forwarded-For. Missing IP shares a conservative bucket.
    const ip = String(req.headers?.['x-vercel-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
    const ipHash = createHmac('sha256',cfg.sessionSecret).update(`community-ip:${ip}`).digest('hex');
    checked(await call('preflight',{ipHash}));
    if (!UUID.test(b.requestId || '') || !['prayer','photo','reflection'].includes(b.kind) || typeof b.text !== 'string' || b.text.trim().length > ({ prayer: 600, photo: 40, reflection: 1000 })[b.kind] || ((b.kind === 'prayer' || b.kind === 'reflection') && !b.text.trim()) || b.consent !== true || !TOKEN.test(b.deleteToken || '') || !(b.eventDay === null || (Number.isInteger(b.eventDay) && b.eventDay >= 0 && b.eventDay <= 5)) || ((b.kind === 'prayer' || b.kind === 'reflection') && b.imageBase64 !== undefined)) throw fail(400,'내용과 공개 동의를 확인해주세요.');
    const image = b.kind === 'photo' ? sanitizePng(b.imageBase64) : null;
    const tokenHash = hash(b.deleteToken);
    const payloadHash = hash(JSON.stringify([b.kind,b.text.trim(),b.eventDay,true,image ? hash(image) : null]));

    const data = checked(await call('submit',{id:b.requestId.toLowerCase(),kind:b.kind,text:b.text.trim(),eventDay:b.eventDay,tokenHash,payloadHash,ipHash}));
    if (image && !data.ready && data.status === 'pending') {
      const response = await fetcher(`${cfg.supabaseUrl}/storage/v1/object/${bucketFor()}/${data.path}`,{method:'POST',headers:{...headers,'Content-Type':'image/png','x-upsert':'false'},body:image});
      if (!response.ok && response.status !== 409) { let problem; try { problem=await response.json(); } catch { /* fail closed */ } if (problem?.statusCode !== '409' && problem?.error !== 'Duplicate') throw fail(503,'사진 전송을 완료하지 못했습니다. 같은 요청으로 다시 시도해주세요.'); }
      return reply(res,200,publicView(await cleanup(checked(await call('finish',{id:b.requestId.toLowerCase(),tokenHash,payloadHash})))));
    }
    return reply(res,200,publicView(await cleanup(data)));
  } catch (error) { return reply(res,error.status || 503,{error:error.status ? error.message : '서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.'}); }
}
