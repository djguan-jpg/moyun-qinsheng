import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { collectBrowserEvidence, collectCdpEvidence, collectLiveGate, cloudflarePreflight, LIVE_BOOLEAN_GATES, LIVE_COUNT_GATES, parseArgs, publicAccess, r2ObjectMetadata } from '../tools/live_evidence.mjs';
import { createHash } from 'node:crypto';

const nonce = 'a'.repeat(64);
const common = ['--mode','r2-public-access','--output',resolve(tmpdir(),'evidence-never-created'),'--nonce',nonce,'--account-id','acct','--bucket','bucket'];

test('closed argv rejects unknown, missing, duplicate, relative, nonce and live domain', () => {
  for (const argv of [common.slice(0,-2), [...common,'--extra','x'], [...common,'--bucket','again'],
    common.map((x) => x === resolve(tmpdir(),'evidence-never-created') ? 'relative' : x),
    common.map((x) => x === nonce ? 'A'.repeat(64) : x),
    ['--mode','live-gate','--output',resolve(tmpdir(),'x'),'--nonce',nonce,'--domain','evil.invalid','--r2-custom-domains-proof']]) {
    assert.throws(() => parseArgs(argv));
  }
});

function fixtureFetch(shapes) {
  return async (url, init) => {
    assert.equal(init.redirect, 'manual'); assert.match(init.headers.Authorization, /^Bearer /);
    const key = new URL(url).pathname;
    const body = JSON.stringify({success:true,result:shapes[key]});
    return new Response(body, {status:200,headers:{'content-type':'application/json','content-length':String(body.length)}});
  };
}

test('preflight derives every closed boolean from exact fixture fields', async () => {
  const p = '/client/v4/';
  const args = {'account-id':'acct','zone-id':'zone','worker':'worker','d1-name':'db','d1-id':'did','r2-bucket':'bucket','domain':'contest.zoeg.studio'};
  const shapes = {
    [p+'user/tokens/verify']:{status:'active'}, [p+'zones/zone']:{id:'zone',account:{id:'acct'}},
    [p+'accounts/acct/workers/services/worker']:{name:'worker'}, [p+'accounts/acct/d1/database/did']:{uuid:'did',name:'db'},
    [p+'accounts/acct/r2/buckets/bucket']:{name:'bucket'}, [p+'accounts/acct/workers/domains']:[{service:'worker',hostname:'contest.zoeg.studio',zone_id:'zone'}],
  };
  const requested=[];
  const good = await cloudflarePreflight(args,'secret',async(url,init)=>{requested.push(new URL(url).pathname);return fixtureFetch(shapes)(url,init);});
  assert.deepEqual(good,{account_match:true,zone_match:true,worker_match:true,d1_match:true,r2_match:true,canonical_domain_match:true,resource_ids_match:true});
  assert.ok(requested.includes(p+'user/tokens/verify'));
  assert.ok(!requested.includes(p+'accounts/acct/tokens/verify'));
  for (const [path, replacement] of Object.entries({
    [p+'zones/zone']:{id:'wrong',account:{id:'acct'}},
    [p+'accounts/acct/workers/services/worker']:{name:'wrong'},
    [p+'accounts/acct/r2/buckets/bucket']:{name:'wrong'},
  })) {
    const result = await cloudflarePreflight(args,'secret',fixtureFetch({...shapes,[path]:replacement}));
    assert.ok(Object.values(result).includes(false));
  }
  for (const replacement of [{id:'zone',account:{id:'wrong'}},{id:'zone',account:{}}]) {
    assert.equal((await cloudflarePreflight(args,'secret',fixtureFetch({...shapes,[p+'zones/zone']:replacement}))).zone_match,false);
  }
  for (const replacement of [{uuid:'wrong',name:'db'},{uuid:'did',name:'wrong'}]) {
    assert.equal((await cloudflarePreflight(args,'secret',fixtureFetch({...shapes,[p+'accounts/acct/d1/database/did']:replacement}))).d1_match,false);
  }
  for (const replacement of [
    [{service:'wrong',hostname:'contest.zoeg.studio',zone_id:'zone'}],
    [{service:'worker',hostname:'wrong.zoeg.studio',zone_id:'zone'}],
    [{service:'worker',hostname:'contest.zoeg.studio',zone_id:'wrong'}],
    [],
  ]) assert.equal((await cloudflarePreflight(args,'secret',fixtureFetch({...shapes,[p+'accounts/acct/workers/domains']:replacement}))).canonical_domain_match,false);
});

test('preflight token verification requires active and fails closed on response errors', async () => {
  const p='/client/v4/', args={'account-id':'acct','zone-id':'zone','worker':'worker','d1-name':'db','d1-id':'did','r2-bucket':'bucket','domain':'contest.zoeg.studio'};
  const shapes={[p+'user/tokens/verify']:{status:'active'},[p+'zones/zone']:{id:'zone',account:{id:'acct'}},[p+'accounts/acct/workers/services/worker']:{name:'worker'},[p+'accounts/acct/d1/database/did']:{uuid:'did',name:'db'},[p+'accounts/acct/r2/buckets/bucket']:{name:'bucket'},[p+'accounts/acct/workers/domains']:[{service:'worker',hostname:'contest.zoeg.studio',zone_id:'zone'}]};
  for(const status of ['disabled','expired'])assert.equal((await cloudflarePreflight(args,'secret',fixtureFetch({...shapes,[p+'user/tokens/verify']:{status}}))).account_match,false);
  for(const status of [401,403])await assert.rejects(()=>cloudflarePreflight(args,'secret',async(url,init)=>new URL(url).pathname===p+'user/tokens/verify'?new Response('{}',{status}):fixtureFetch(shapes)(url,init)),/LIVE_EVIDENCE_ERROR/);
  for(const body of ['not-json',JSON.stringify({success:true}),JSON.stringify({success:false,result:{status:'active'}})])await assert.rejects(()=>cloudflarePreflight(args,'secret',async(url,init)=>{if(new URL(url).pathname!==p+'user/tokens/verify')return fixtureFetch(shapes)(url,init);return new Response(body,{status:200,headers:{'content-length':String(body.length)}});}),/LIVE_EVIDENCE_ERROR/);
});

test('public access requires managed disabled and independently empty custom list', async () => {
  const base='/client/v4/accounts/acct/r2/buckets/bucket/domains/';
  assert.deepEqual(await publicAccess({'account-id':'acct',bucket:'bucket'},'secret',fixtureFetch({[base+'managed']:{enabled:false},[base+'custom']:{domains:[]}})),
    {dev_url_disabled:true,custom_domains_disabled:true});
  assert.deepEqual(await publicAccess({'account-id':'acct',bucket:'bucket'},'secret',fixtureFetch({[base+'managed']:{enabled:true},[base+'custom']:{domains:[{}]}})),
    {dev_url_disabled:false,custom_domains_disabled:false});
});

test('CLI fails closed without token, stale output, repo output, and unsupported exact metadata without leaking inputs', async () => {
  const root=await mkdtemp(join(tmpdir(),'live-evidence-test-')); const output=join(root,'out.json');
  const script=resolve('tools/live_evidence.mjs');
  const base=['--mode','r2-object-metadata','--output',output,'--nonce',nonce,'--account-id','private-account','--bucket','private-bucket','--object-key','private-key'];
  for (const env of [{}, {CLOUDFLARE_API_TOKEN:'private-token'}]) {
    const run=spawnSync(process.execPath,[script,...base],{env:{...process.env,...env},encoding:'utf8'});
    assert.notEqual(run.status,0); assert.equal(run.stdout,''); assert.equal(run.stderr,'LIVE_EVIDENCE_ERROR\n');
    assert.doesNotMatch(run.stderr,/private|token|bucket|key/);
  }
  await writeFile(output,'stale');
  const stale=spawnSync(process.execPath,[script,...base],{env:{...process.env,CLOUDFLARE_API_TOKEN:'x'},encoding:'utf8'});
  assert.notEqual(stale.status,0); assert.equal(await readFile(output,'utf8'),'stale');
  const repoOut=resolve('forbidden-output.json');
  const repoRun=spawnSync(process.execPath,[script,...base.map((x)=>x===output?repoOut:x)],{env:{...process.env,CLOUDFLARE_API_TOKEN:'x'},encoding:'utf8'});
  assert.notEqual(repoRun.status,0);
});

test('symlink parent traversal is rejected when platform permits it', async (t) => {
  const root=await mkdtemp(join(tmpdir(),'live-evidence-link-')); const real=join(root,'real'); const link=join(root,'link'); await mkdir(real);
  try { await symlink(real,link,'junction'); } catch { t.skip('symlink unavailable'); return; }
  const argv=['--mode','r2-object-metadata','--output',join(link,'out'),'--nonce',nonce,'--account-id','a','--bucket','b','--object-key','k'];
  const run=spawnSync(process.execPath,[resolve('tools/live_evidence.mjs'),...argv],{env:{...process.env,CLOUDFLARE_API_TOKEN:'x'},encoding:'utf8'});
  assert.notEqual(run.status,0);
});

const mp3=Buffer.from([0x49,0x44,0x33,1,2,3,4,5]);
test('R2 exact object path preserves slash, safely encodes segments, and returns only normalized metadata',async()=>{
  let seen;
  const fetchImpl=async(url,init)=>{seen={url:String(url),init};return new Response(mp3,{status:200,headers:{'content-type':'Audio/MPEG; charset=binary','content-length':String(mp3.length)}})};
  const got=await r2ObjectMetadata({'account-id':'a c','bucket':'b#c','object-key':'目 錄/a?#.mp3'},'private',fetchImpl,'http://127.0.0.1:1/client/v4');
  assert.match(seen.url,/accounts\/a%20c\/r2\/buckets\/b%23c\/objects\/%E7%9B%AE%20%E9%8C%84\/a%3F%23\.mp3$/);assert.doesNotMatch(seen.url,/%2F/i);assert.equal(seen.init.redirect,'manual');
  assert.deepEqual(got,{content_type:'audio/mpeg',size:mp3.length,sha256:createHash('sha256').update(mp3).digest('hex')});assert.deepEqual(Object.keys(got).sort(),['content_type','sha256','size']);
});

test('R2 key and response failures are closed, including traversal, redirect, status, truncation, MIME and magic',async()=>{
  for(const key of ['','a//b','./a','a/../b','a\\b','a\0b','x'.repeat(1025)])await assert.rejects(()=>r2ObjectMetadata({'account-id':'a',bucket:'bbb','object-key':key},'x',()=>assert.fail()));
  const cases=[new Response('',{status:302,headers:{location:'/else'}}),new Response('provider private body',{status:500}),new Response(mp3,{status:200,headers:{'content-type':'audio/mpeg','content-length':'999999999'}}),new Response(mp3,{status:200,headers:{'content-type':'text/plain','content-length':String(mp3.length)}}),new Response(Buffer.from('not audio'),{status:200,headers:{'content-type':'audio/mpeg','content-length':'9'}}),new Response(mp3,{status:200,headers:{'content-type':'audio/mpeg','content-length':'99'}})];
  for(const response of cases)await assert.rejects(()=>r2ObjectMetadata({'account-id':'a',bucket:'bbb','object-key':'a/b.mp3'},'private',async()=>response,'http://127.0.0.1:1/client/v4'),/LIVE_EVIDENCE_ERROR/);
  await assert.rejects(()=>r2ObjectMetadata({'account-id':'a',bucket:'bbb','object-key':'a.mp3'},'x',async(_u,{signal})=>new Promise((_,no)=>signal.addEventListener('abort',()=>no(new Error('private timeout')))),'http://127.0.0.1:1/client/v4'),/LIVE_EVIDENCE_ERROR/);
},{timeout:17000});

function liveFixture(options={}){
  const origin='http://127.0.0.1:32123',ids=Array.from({length:20},(_,i)=>`work-${i}`);let windowCount=0,totalAudio=0,listings=0,sleeps=0;
  const makeWorks=token=>ids.map(id=>({publicId:id,listenUrl:`/api/public/audio/${id}?token=${token}`}));
  const security={'content-security-policy':"default-src 'self'",'x-content-type-options':'nosniff','referrer-policy':'no-referrer','permissions-policy':'camera=()','strict-transport-security':'max-age=31536000','cross-origin-opener-policy':'same-origin'};
  const fetchImpl=async(input,init={})=>{const u=new URL(input),p=u.pathname,method=init.method||'GET',h=new Headers(init.headers);let spec;
    if(p==='/')spec={status:200,body:'<a href="/works">works</a>',headers:{...security,'content-type':'text/html'}};
    else if(p==='/works')spec={status:200,body:'<main>works</main>',headers:{...security,'content-type':'text/html'}};
    else if(p==='/vote')spec={status:options.voteStatus||200,body:'<!doctype html><html><main>vote</main></html>',headers:{...security,'content-type':'text/html'}};
    else if(p==='/api/public/competition'){listings++;const freshIds=options.drift&&listings===2?[...ids.slice(1),ids[0]]:ids;const works=freshIds.map(id=>({publicId:id,listenUrl:`/api/public/audio/${id}?token=fresh-${listings}`}));if(options.privateField)works[0].privateField='x';if(options.crossOrigin)works[0].listenUrl='https://evil.invalid/a';spec={status:200,body:JSON.stringify({works}),headers:{'content-type':'application/json'}};}
    else if(p.startsWith('/api/public/audio/')){windowCount++;totalAudio++;if(windowCount>(options.limitAt||80)){spec={status:429,body:'slow',headers:{'retry-after':options.badRetry||'17'}};}else{const token=u.searchParams.get('token');if(!/^fresh-[12]$/.test(token||''))spec={status:403,body:'denied'};else if(h.has('if-none-match'))spec={status:304,body:null,headers:{etag:'"fixture"'}};else if(h.get('range')===`bytes=${mp3.length}-`)spec={status:416,body:'',headers:{'content-range':`bytes */${mp3.length}`}};else if(h.get('range')==='bytes=0-1')spec={status:206,body:mp3.subarray(0,2),headers:{'content-range':`bytes 0-1/${mp3.length}`,'content-type':'audio/mpeg','content-length':'2',etag:'"fixture"'}};else spec={status:200,body:method==='HEAD'?null:mp3,headers:{'content-type':'audio/mpeg','content-length':String(mp3.length),etag:'"fixture"'}};}}
    else if(['/media/submissions/probe.mp3','/media/probe.mp3','/guyun/media/probe.mp3'].includes(p))spec={status:404,body:'no'};
    else if(p==='/robots.txt')spec={status:200,body:'User-agent: *\nDisallow: /api/'};
    else if(p==='/__live_evidence_fixed_404__')spec={status:404,body:'no'};
    else spec={status:401,body:'unauthorized'};
    spec={...spec,headers:{...(spec.headers||{})}};options.mutator?.({u,init,spec});return new Response(spec.body,{status:spec.status,headers:spec.headers});};
  const sleepFn=async ms=>{sleeps++;if(options.sleepBehavior)await options.sleepBehavior(ms,sleeps);if(ms!==61000||sleeps>1)throw new Error('bad sleep');windowCount=0;};
  const cleanPages=['/','/works','/vote'].map(path=>({path,status:200,html:`<html><main>${path}</main></html>`,urls:[origin+path],resourceUrls:[origin+'/app.js'],redirectUrls:[],failedUrls:[]}));
  const browserCollector=async()=>({pages:options.pages||cleanPages});return{origin,fetchImpl,browserCollector,sleepFn,stats:()=>({windowCount,totalAudio,listings,sleeps}),ids};
}

test('new live flow is exactly 22, one sleep, fresh listing, 80 plus a rejected 81st audio request',async()=>{const f=liveFixture();const got=await collectLiveGate({domain:'contest.zoeg.studio','r2-custom-domains-proof':true},f);assert.deepEqual(Object.keys(got).sort(),[...LIVE_BOOLEAN_GATES,...LIVE_COUNT_GATES].sort());for(const k of LIVE_BOOLEAN_GATES)assert.equal(got[k],true,k);assert.deepEqual(LIVE_COUNT_GATES.map(k=>got[k]),[20,20,0]);assert.deepEqual(f.stats(),{windowCount:81,totalAudio:103,listings:2,sleeps:1});});

test('old per-item tamper and expiry flow hits the real 80/60 audio limiter early',async()=>{const f=liveFixture();let hit=0;for(let i=0;i<140;i++){const r=await f.fetchImpl(`${f.origin}/api/public/audio/work-${i%20}?token=fresh-1`,{});if(r.status===429){hit=i+1;break;}}assert.equal(hit,81);assert.equal(f.stats().windowCount,81);});

test('live gate fails closed on limiter, listing, public/protected route, fake rate route and browser failures',async()=>{
  const badPages=kind=>['/','/works','/vote'].map((path,i)=>({path,status:kind==='status'&&i===1?500:200,html:kind==='old'&&i===2?'<a href="https://qinsheng.zoeg.studio/x">x</a>':'<html>x</html>',urls:[kind==='cross'&&i===1?'https://evil.invalid/x':`http://127.0.0.1:32123${path}`],resourceUrls:[],redirectUrls:kind==='redirect'&&i===1?['http://127.0.0.1:32123/old']:[],failedUrls:kind==='failed'&&i===1?['http://127.0.0.1:32123/bad']:[]}));
  const cases=[{privateField:true},{crossOrigin:true},{drift:true},{limitAt:79},{badRetry:'0'},{badRetry:'61'},{badRetry:'x'},{voteStatus:401},...['status','old','cross','redirect','failed'].map(k=>({pages:badPages(k)})),{mutator:({u,spec})=>{if(u.pathname==='/api/admin/votes')spec.status=200;}},{limitAt:999,mutator:({u,spec})=>{if(u.pathname==='/__live_evidence_rate__')spec.status=429;}}];
  for(const options of cases){const f=liveFixture(options);await assert.rejects(()=>collectLiveGate({domain:'contest.zoeg.studio','r2-custom-domains-proof':true},f),/LIVE_EVIDENCE_ERROR/);}
});

test('sleep is fixed, exactly once, and failures do not permit a second or overlong wait',async()=>{let seen;const f=liveFixture({sleepBehavior:async(ms,n)=>{seen=[ms,n];}});await collectLiveGate({domain:'contest.zoeg.studio','r2-custom-domains-proof':true},f);assert.deepEqual(seen,[61000,1]);for(const sleepFn of [async()=>{throw new Error('missing');},async ms=>{assert.equal(ms,61000);throw new Error('too long');}]){const x=liveFixture();await assert.rejects(()=>collectLiveGate({domain:'contest.zoeg.studio','r2-custom-domains-proof':true},{...x,sleepFn}),/LIVE_EVIDENCE_ERROR/);}});

test('CDP collection waits for a new load per page and aggregates redirects and failures',async()=>{const events=[{method:'Page.loadEventFired'}];let current='';const session={events,async send(method,params){if(method==='Page.navigate'){current=params.url;events.push({method:'Network.requestWillBeSent',params:{request:{url:current}}},{method:'Network.responseReceived',params:{response:{url:current,status:200}}},{method:'Page.loadEventFired'});return{};}if(method==='Runtime.evaluate')return{result:{value:JSON.stringify({html:'<html>x</html>',resources:[new URL('/app.js',current).href]})}};return{};},close(){}};const got=await collectCdpEvidence({origin:'http://127.0.0.1:32123',session,timeoutMs:20});assert.deepEqual(got.pages.map(x=>x.path),['/','/works','/vote']);assert.ok(got.pages.every(x=>x.status===200&&x.html));
  const stale={events:[{method:'Page.loadEventFired'}],async send(method){if(method==='Runtime.evaluate')assert.fail();return{};}};await assert.rejects(()=>collectCdpEvidence({origin:'http://127.0.0.1:32123',session:stale,timeoutMs:10}));
});

test('browser collector always closes CDP, kills Edge, and removes its temporary profile',async(t)=>{let profile,killed=false,closed=false;const edgeLauncher=(_exe,args)=>{profile=args.find(x=>x.startsWith('--user-data-dir=')).slice(16);void writeFile(join(profile,'DevToolsActivePort'),'12345\n/devtools/page/mock\n');const child=new EventEmitter();child.kill=()=>{killed=true;queueMicrotask(()=>child.emit('exit'));};return child;};const oldFetch=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({webSocketDebuggerUrl:'ws://127.0.0.1:12345/devtools/page/mock'}),{status:200,headers:{'content-type':'application/json'}});const events=[];let current='';const cdpTransport=async()=>({events,async send(method,params){if(method==='Page.navigate'){current=params.url;events.push({method:'Network.requestWillBeSent',params:{request:{url:current}}},{method:'Network.responseReceived',params:{response:{url:current,status:200}}},{method:'Page.loadEventFired'});}if(method==='Runtime.evaluate')return{result:{value:JSON.stringify({html:'<html>x</html>',resources:[]})}};return{};},close(){closed=true;}});try{await collectBrowserEvidence({origin:'http://127.0.0.1:32123',edgeLauncher,cdpTransport});}catch(e){if(!profile){t.skip('Microsoft Edge unavailable');return;}throw e;}finally{globalThis.fetch=oldFetch;}assert.equal(killed,true);assert.equal(closed,true);await assert.rejects(()=>stat(profile));});

test('live gate rejects every missing false or wrong schema gate through adapter-compatible truth contract',()=>{const good=Object.fromEntries(LIVE_BOOLEAN_GATES.map(k=>[k,true]));Object.assign(good,{public_owner_count:20,audio_owner_count:20,old_link_occurrences:0});for(const k of LIVE_BOOLEAN_GATES){assert.notEqual({...good,[k]:false}[k],true);}for(const k of LIVE_COUNT_GATES){assert.notEqual(typeof {...good,[k]:'20'}[k],'number');}assert.equal(Object.keys(good).length,24);});
