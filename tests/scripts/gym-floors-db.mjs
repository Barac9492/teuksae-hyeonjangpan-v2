// Synthetic in-memory PostgreSQL only; no remote DB or production credentials.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
const scalar = async (sql, args = []) => Object.values((await rows(sql, args))[0])[0];
const migration = '20261006215814_split_gym_floors.sql';
const dir = new URL('../../supabase/migrations/', import.meta.url);
await db.exec(`create role anon; create role authenticated; create role service_role;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key,bucket_id text,name text);`);
for (const file of (await readdir(dir)).filter(f => f.endsWith('.sql') && !f.startsWith('001') && f !== migration).sort()) {
  await db.exec(await readFile(new URL(file, dir), 'utf8'));
}
const sessions = {};
for (const role of ['space', 'parking']) {
  sessions[role] = randomUUID();
  await db.query('insert into ops_accounts(username,role,display_label,active) values($1,$2,$1,true)', [role.toUpperCase(), role]);
  await db.query(`insert into ops_sessions(id,username,credential_version,display_name,label,expires_at) values($1,$2,1,'Synthetic',$3,now()+interval '1 day')`, [sessions[role], role.toUpperCase(), 'S-' + randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()]);
}
const call = (id, state, percent, version, session = sessions.space, request = randomUUID()) => scalar('select ops_set_resource_state($1,$2,$3,$4,$5,$6)', [session, id, state, version, request, percent]);
const legacyRequest = randomUUID();
const legacy = await call('space.songrim.gym', 'busy', 90, 0, sessions.space, legacyRequest);
const before = await rows('select * from ops_resources order by id');
const history = await rows('select * from ops_history order by id');
const receipts = await rows('select * from ops_request_receipts order by request_id');
const access = await rows("select relname, relacl, relrowsecurity from pg_class where relname in ('ops_resources','ops_history','ops_request_receipts') order by relname");
const sql = await readFile(new URL(migration, dir), 'utf8');
await assert.rejects(() => db.exec(sql.replace(/commit;\s*$/, 'select 1/0; commit;')));
await db.exec('rollback');
assert.deepEqual(await rows('select * from ops_resources order by id'), before);
await db.exec(sql);
assert.deepEqual(await rows("select * from ops_resources where id not in ('space.songrim.gym.f1','space.songrim.gym.f2') order by id"), before);
assert.deepEqual(await rows('select * from ops_history order by id'), history);
assert.deepEqual(await rows('select * from ops_request_receipts order by request_id'), receipts);
assert.deepEqual(await rows("select relname, relacl, relrowsecurity from pg_class where relname in ('ops_resources','ops_history','ops_request_receipts') order by relname"), access);
for (const floor of [1, 2]) {
  const id = `space.songrim.gym.f${floor}`;
  assert.deepEqual(await rows('select label,category,state,version,updated_at,occupancy_percent,last_full_at,last_closed_at from ops_resources where id=$1', [id]), [{ label: `체육관 ${floor}층`, category: 'space', state: 'checking', version: 0, updated_at: null, occupancy_percent: null, last_full_at: null, last_closed_at: null }]);
}
assert.deepEqual(await call('space.songrim.gym', 'busy', 90, 0, sessions.space, legacyRequest), legacy);
for (const floor of [1, 2]) {
  const id = `space.songrim.gym.f${floor}`;
  const others = await rows('select * from ops_resources where id<>$1 order by id', [id]);
  let version = 0;
  for (let percent = 0; percent <= 100; percent += 10) {
    const state = percent === 100 ? 'full' : percent >= 70 ? 'busy' : 'available';
    const request = randomUUID();
    const saved = await call(id, state, percent, version, sessions.space, request);
    assert.equal(saved.status, 'ok');
    assert.equal(saved.resource.occupancyPercent, percent);
    assert.deepEqual(await call(id, state, percent, version, sessions.space, request), saved);
    assert.equal((await call(id, state, percent, version)).status, 'conflict');
    const pub = await scalar('select ops_public_resources()');
    const admin = await scalar('select ops_list_operations($1)', [sessions.space]);
    assert.deepEqual(pub.find(r => r.id === id), admin.resources.find(r => r.id === id));
    version++;
  }
  for (const [state, percent] of [['busy', 65], ['full', 90], ['available', 70], ['closed', 30]]) {
    await assert.rejects(() => call(id, state, percent, version));
  }
  await assert.rejects(() => call(id, 'available', 20, version, sessions.parking), /unauthorized/);
  for (const state of ['checking', 'closed']) assert.equal((await call(id, state, null, version++)).resource.occupancyPercent, null);
  assert.deepEqual(await rows('select * from ops_resources where id<>$1 order by id', [id]), others);
}
const after = await rows('select * from ops_resources order by id');
await db.exec(sql);
assert.deepEqual(await rows('select * from ops_resources order by id'), after, 'rerun never overwrites actual floor readings');
for (const role of ['anon', 'authenticated']) {
  assert.equal(await scalar("select has_table_privilege($1,'ops_resources','UPDATE')", [role]), false);
  assert.equal(await scalar("select has_function_privilege($1,'ops_set_resource_state(uuid,text,text,integer,uuid,integer,integer)','EXECUTE')", [role]), false);
}
console.log('PASS gym floors: rollback, exact preservation, unknown initialization, 22 percentage saves, independent writes, public/admin parity, replay, conflicts, validation, permissions, safe rerun');
await db.close();
