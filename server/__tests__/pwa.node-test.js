import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const sw = await readFile(new URL('../../public/sw.js',import.meta.url),'utf8');
function worker(response = new Response('ok',{headers:{'content-type':'application/javascript'}}), storageBroken=false) {
 const handlers={},puts=[],deleted=[];
 const context={self:{location:{origin:'https://example.test'},addEventListener:(type,handler)=>{handlers[type]=handler;},clients:{claim:async()=>{}},skipWaiting:async()=>{}},URL,Response,
 fetch:async()=>response,
 caches:{match:async()=>undefined,keys:async()=>['unrelated-cache','teuksae-old'],delete:async key=>{deleted.push(key);return true;},open:async()=>{if(storageBroken)throw Error('unavailable');return{put:async(...args)=>puts.push(args),addAll:async()=>{}};}}};
 runInNewContext(sw,context);return{handlers,puts,deleted};
}
function request(w,path,mode='cors',method='GET') {let result;w.handlers.fetch({request:{url:new URL(path,'https://example.test').href,method,mode},respondWith:p=>{result=p;}});return result;}
test('PWA manifest and installation icons are valid PNG assets',async()=>{
 const m=JSON.parse(await readFile(new URL('../../public/manifest.webmanifest',import.meta.url),'utf8'));
 assert.equal(m.id,'/');assert.equal(m.start_url,'/');assert.equal(m.scope,'/');assert.equal(m.display,'standalone');
 for(const size of [180,192,512]){const b=await readFile(new URL(`../../public/icon-${size}.png`,import.meta.url));assert.equal(b.toString('hex',0,8),'89504e470d0a1a0a');assert.equal(b.readUInt32BE(16),size);assert.equal(b.readUInt32BE(20),size);}
 assert.deepEqual(m.icons.map(i=>i.sizes),['192x192','512x512']);
});
test('worker never intercepts API, admin, external storage or writes',()=>{
 const w=worker();for(const path of ['/api/status','/api/community','/admin','/admin/accounts','https://abc.supabase.co/storage/photo'])assert.equal(request(w,path,'navigate'),undefined);
 assert.equal(request(w,'/api/community','cors','POST'),undefined);assert.equal(w.puts.length,0);
});
test('worker caches successful HTML navigation only',async()=>{
 for(const status of [200,503]){const w=worker(new Response('<html>app</html>',{status,headers:{'content-type':'text/html'}}));const response=await request(w,'/','navigate');assert.equal(response.status,status);assert.equal(w.puts.length,status===200?1:0);}
});
test('worker never poisons JavaScript cache with failed responses or SPA HTML',async()=>{
 for(const [status,type] of [[404,'application/javascript'],[200,'text/html']]){const w=worker(new Response('bad',{status,headers:{'content-type':type}}));await request(w,'/assets/chunk.js');assert.equal(w.puts.length,0);}
 const w=worker();await request(w,'/assets/chunk.js');assert.equal(w.puts.length,1);
});
test('storage failure does not break successful online navigation or assets',async()=>{
 const nav=worker(new Response('<html>ok</html>',{headers:{'content-type':'text/html'}}),true);assert.equal((await request(nav,'/','navigate')).status,200);
 const asset=worker(undefined,true);assert.equal((await request(asset,'/assets/app.js')).status,200);
});
test('activation only deletes this applications old caches',async()=>{
 const w=worker();let pending;w.handlers.activate({waitUntil:p=>{pending=p;}});await pending;assert.deepEqual(w.deleted,['teuksae-old']);
});
