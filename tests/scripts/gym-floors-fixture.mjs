// Local-only UI fixture: all readings and sessions are synthetic, no Supabase client.
import { createServer } from 'vite';
import { appendFile } from 'node:fs/promises';
const now = () => new Date().toISOString();
const resource = (id, label, state, occupancyPercent = null) => ({ id, label, category: id.startsWith('parking') ? 'parking' : 'space', state, occupancyPercent, version: 1, updatedAt: now() });
const resources = [
  resource('space.songrim.access', '송림본당 개방 단계', 'hall_closed'),
  resource('space.songrim.hall', '본당1·2층', 'full', 100),
  resource('space.songrim.f4', '본당 4층', 'closed'),
  resource('space.songrim.gym', '체육관', 'busy', 90),
  ...[1, 2].map(n => ({ ...resource(`space.songrim.gym.f${n}`, `체육관 ${n}층`, 'checking'), version: 0, updatedAt: null })),
  resource('space.dream.f11', '드림센터 11층', 'closed'),
  resource('space.dream.f7', '드림센터 7층', 'busy', 80),
  resource('space.dream.f3', '드림센터 3층', 'available', 40),
  resource('parking.songrim', '송림주차장', 'busy', 70),
  resource('parking.dream', '드림센터 주차장', 'available', 20),
];
const history = [];
const server = await createServer({ server: { host: '127.0.0.1', port: 4197, strictPort: true }, plugins: [{ name: 'synthetic-gym-api', configureServer(vite) {
  vite.middlewares.use(async (req, res, next) => {
    if (!req.url.startsWith('/api/')) return next();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    const reply = (body, status = 200) => { res.statusCode = status; res.end(JSON.stringify(body)); };
    if (req.url === '/api/admin/session') return reply({ authenticated: true, username: 'LOCAL-FIXTURE', role: 'space', displayName: '합성 검증', expiresAt: '2030-01-01T00:00:00Z', sessionId: 'fixture', capabilities: { liveOperations: true } });
    if (req.url === '/api/status') return reply({ enabled: true, rehearsal: false, resources });
    if (req.url === '/api/community') return reply({ enabled: true, items: [], photoCountToday: 0, today: '2026-10-07' });
    if (req.url !== '/api/admin/operations') return reply({ error: 'fixture endpoint unavailable' }, 404);
    if (req.method !== 'POST') return reply({ resources, publicResources: resources, history, canManageAccounts: false });
    let text = ''; for await (const chunk of req) text += chunk;
    const payload = JSON.parse(text);
    const row = resources.find(r => r.id === payload.resourceId);
    if (!row || !row.id.startsWith('space.songrim.gym.f')) return reply({ error: 'fixture only permits new gym floors' }, 403);
    if (row.version !== payload.expectedVersion) return reply({ resource: row }, 409);
    Object.assign(row, { state: payload.state, occupancyPercent: payload.occupancyPercent, version: row.version + 1, updatedAt: now() });
    await appendFile('/tmp/gym-fixture-writes.jsonl', JSON.stringify(payload) + '\n');
    return reply({ resource: row });
  });
} }] });
await server.listen();
console.log('Synthetic gym fixture http://127.0.0.1:4197 (no production connections)');
