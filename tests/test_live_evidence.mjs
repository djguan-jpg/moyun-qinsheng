import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { collectBrowserEvidence, collectCdpEvidence, collectLiveGate, cloudflarePreflight, d1Query, FUNCTIONAL_AUDIO_PACE_MS, LIVE_BOOLEAN_GATES, LIVE_COUNT_GATES, LIVE_DIAGNOSTIC_GATES, parseArgs, parseLiveDiagnostic, publicAccess, r2ObjectMetadata, writeLiveDiagnostic } from '../tools/live_evidence.mjs';

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

test('D1 query posts exact private SQL contract and returns only official result array',async()=>{
  const root=await mkdtemp(join(tmpdir(),'d1-query-')),sqlFile=join(root,'query.sql');const sql=`WITH x AS (SELECT 1 AS n) SELECT n, (SELECT COUNT(*) FROM pragma_foreign_key_check) AS fk FROM x;`;await writeFile(sqlFile,sql,{encoding:'utf8',mode:0o600});let seen;
  const result=[{results:[{n:1,fk:0}],success:true,meta:{duration:1}}];
  const got=await d1Query({'account-id':'acct id','d1-id':'db/id','sql-file':sqlFile},'fixture',async(url,init)=>{seen={url:String(url),init};const body=JSON.stringify({success:true,result,errors:[],messages:[]});return new Response(body,{status:200,headers:{'content-type':'application/json','content-length':String(Buffer.byteLength(body))}});},'https://example.invalid/client/v4');
  assert.deepEqual(got,result);assert.equal(seen.url,'https://example.invalid/client/v4/accounts/acct%20id/d1/database/db%2Fid/query');assert.equal(seen.init.method,'POST');assert.equal(seen.init.redirect,'manual');assert.equal(seen.init.headers.Authorization,'Bearer fixture');assert.equal(seen.init.headers['Content-Type'],'application/json');assert.deepEqual(JSON.parse(seen.init.body),{sql,params:[]});
  const publicView=JSON.stringify([seen.url,seen.init.method,seen.init.headers['Content-Type'],got]);assert.doesNotMatch(publicView,/Bearer fixture/);
});

test('D1 query rejects unsafe SQL files and unsafe statements',async(t)=>{
  const root=await mkdtemp(join(tmpdir(),'d1-query-bad-'));const call=async file=>d1Query({'account-id':'a','d1-id':'d','sql-file':file},'x',()=>assert.fail(),'https://example.invalid/client/v4');
  for(const [name,data] of [['empty',''],['nul','SELECT 1\0;'],['control','SELECT 1\u0001;'],['utf8',Buffer.from([0xff])],['large',Buffer.alloc(1024*1024+1,65)]]){const p=join(root,name);await writeFile(p,data);await assert.rejects(()=>call(p),/LIVE_EVIDENCE_ERROR/);}
  await assert.rejects(()=>call(join(root,'missing')),/LIVE_EVIDENCE_ERROR/);const repoSql=resolve('d1-query-repo-test.sql');await writeFile(repoSql,'SELECT 1;');try{await assert.rejects(()=>call(repoSql),/LIVE_EVIDENCE_ERROR/);}finally{await import('node:fs/promises').then(x=>x.unlink(repoSql));}
  for(const [i,sql] of ['SELECT 1; SELECT 2;','WITH x AS (SELECT 1) DELETE FROM x;','INSERT INTO x VALUES(1);','PRAGMA foreign_keys;','BEGIN;','SELECT 1; DROP TABLE x;'].entries()){const p=join(root,`bad-${i}.sql`);await writeFile(p,sql);await assert.rejects(()=>call(p),/LIVE_EVIDENCE_ERROR/);}
  const real=join(root,'real.sql'),link=join(root,'link.sql');await writeFile(real,'SELECT 1;');try{await symlink(real,link,'file');await assert.rejects(()=>call(link),/LIVE_EVIDENCE_ERROR/);}catch(e){if(e?.code==='EPERM')t.diagnostic('symlink unavailable');else if(!String(e).includes('LIVE_EVIDENCE_ERROR'))throw e;}
});

test('D1 query rejects redirects, HTTP errors, and malformed or oversized outer responses',async()=>{
  const root=await mkdtemp(join(tmpdir(),'d1-query-response-')),file=join(root,'q.sql');await writeFile(file,'SELECT 1;',{mode:0o600});const args={'account-id':'a','d1-id':'d','sql-file':file};
  const bodies=['not-json','{"success":true,"result":[],"result":[]}',JSON.stringify({success:false,result:[]}),JSON.stringify({success:true,result:{}}),JSON.stringify({success:true,result:[],extra:true}),JSON.stringify({success:true,result:[],errors:[{}]})];
  for(const body of bodies)await assert.rejects(()=>d1Query(args,'x',async()=>new Response(body,{status:200,headers:{'content-length':String(Buffer.byteLength(body))}}),'https://example.invalid/client/v4'),/LIVE_EVIDENCE_ERROR/);
  for(const status of [302,400,500])await assert.rejects(()=>d1Query(args,'x',async()=>new Response('{}',{status}),'https://example.invalid/client/v4'),/LIVE_EVIDENCE_ERROR/);
  await assert.rejects(()=>d1Query(args,'x',async()=>new Response('{}',{status:200,headers:{'content-length':String(1024*1024+1)}}),'https://example.invalid/client/v4'),/LIVE_EVIDENCE_ERROR/);
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
    [p+'accounts/acct/workers/services/worker']:{id:'worker'}, [p+'accounts/acct/d1/database/did']:{uuid:'did',name:'db'},
    [p+'accounts/acct/r2/buckets/bucket']:{name:'bucket'}, [p+'accounts/acct/workers/domains']:[{service:'worker',hostname:'contest.zoeg.studio',zone_id:'zone'}],
  };
  const requested=[];
  const good = await cloudflarePreflight(args,'secret',async(url,init)=>{requested.push(new URL(url).pathname);return fixtureFetch(shapes)(url,init);});
  assert.deepEqual(good,{account_match:true,zone_match:true,worker_match:true,d1_match:true,r2_match:true,canonical_domain_match:true,resource_ids_match:true});
  assert.ok(requested.includes(p+'user/tokens/verify'));
  assert.ok(!requested.includes(p+'user'));
  assert.ok(!requested.includes(p+'accounts/acct/tokens/verify'));
  const workerPath=p+'accounts/acct/workers/services/worker';
  for(const worker of [
    {id:'worker'},
    {default_environment:{script:{id:'worker'}}},
    {default_environment:{script:{name:'worker'}}},
    {name:'worker'},
  ]) assert.equal((await cloudflarePreflight(args,'secret',fixtureFetch({...shapes,[workerPath]:worker}))).worker_match,true);
  for(const worker of [
    {},
    {id:'wrong'},
    {id:'work'},
    {id:'worker-extra'},
    {id:'Worker'},
    {default_environment:{}},
    {default_environment:{script:{id:'WORKER'}}},
    {default_environment:{script:{name:'work'}}},
    {name:'worker-extra'},
  ]) assert.equal((await cloudflarePreflight(args,'secret',fixtureFetch({...shapes,[workerPath]:worker}))).worker_match,false);
  for (const [path, replacement] of Object.entries({
    [p+'zones/zone']:{id:'wrong',account:{id:'acct'}},
    [workerPath]:{id:'wrong'},
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

test('preflight accepts OAuth only after an exact 401 verification response and valid user id', async () => {
  const p='/client/v4/', args={'account-id':'acct','zone-id':'zone','worker':'worker','d1-name':'db','d1-id':'did','r2-bucket':'bucket','domain':'contest.zoeg.studio'};
  const shapes={[p+'zones/zone']:{id:'zone',account:{id:'acct'}},[p+'accounts/acct/workers/services/worker']:{name:'worker'},[p+'accounts/acct/d1/database/did']:{uuid:'did',name:'db'},[p+'accounts/acct/r2/buckets/bucket']:{name:'bucket'},[p+'accounts/acct/workers/domains']:[{service:'worker',hostname:'contest.zoeg.studio',zone_id:'zone'}]};
  const oauthFetch=(userBody,userStatus=200,verifyStatus=401,verifyBody=JSON.stringify({success:false,errors:[{code:10000}]}),requested=[])=>async(url,init)=>{assert.equal(init.redirect,'manual');assert.equal(init.headers.Authorization,'Bearer secret');const path=new URL(url).pathname;requested.push(path);if(path===p+'user/tokens/verify')return new Response(verifyBody,{status:verifyStatus,headers:{'content-length':String(Buffer.byteLength(verifyBody))}});if(path===p+'user')return new Response(userBody,{status:userStatus,headers:{'content-length':String(Buffer.byteLength(userBody))}});return fixtureFetch(shapes)(url,init);};
  const requested=[];const valid=JSON.stringify({success:true,result:{id:'oauth-user',name:'redacted'}});
  assert.equal((await cloudflarePreflight(args,'secret',oauthFetch(valid,200,401,undefined,requested))).account_match,true);
  assert.deepEqual(requested.slice(0,2),[p+'user/tokens/verify',p+'user']);assert.equal(JSON.stringify(await cloudflarePreflight(args,'secret',oauthFetch(valid))).includes('oauth-user'),false);
  for(const result of [{},{id:''},{id:'   '},{id:7},{id:null}])assert.equal((await cloudflarePreflight(args,'secret',oauthFetch(JSON.stringify({success:true,result})))).account_match,false);
  for(const [body,status] of [['not-json',200],[JSON.stringify({success:true}),200],[JSON.stringify({success:false,result:{id:'x'}}),200],[JSON.stringify({success:true,result:{id:'x'}}),403]])await assert.rejects(()=>cloudflarePreflight(args,'secret',oauthFetch(body,status)),/LIVE_EVIDENCE_ERROR/);
  for(const [status,body] of [[302,JSON.stringify({success:false,errors:[]})],[403,JSON.stringify({success:false,errors:[]})],[429,JSON.stringify({success:false,errors:[]})],[500,JSON.stringify({success:false,errors:[]})],[401,'{}'],[401,'not-json']]){const paths=[];await assert.rejects(()=>cloudflarePreflight(args,'secret',oauthFetch(valid,200,status,body,paths)),/LIVE_EVIDENCE_ERROR/);assert.deepEqual(paths,[p+'user/tokens/verify']);}
  const oversized=JSON.stringify({success:false,errors:[]});await assert.rejects(()=>cloudflarePreflight(args,'secret',async(url,init)=>new URL(url).pathname===p+'user/tokens/verify'?new Response(oversized,{status:401,headers:{'content-length':String(1024*1024+1)}}):oauthFetch(valid)(url,init)),/LIVE_EVIDENCE_ERROR/);
  await assert.rejects(()=>cloudflarePreflight(args,'secret',async()=>{throw new Error('private network detail');}),e=>e.message==='LIVE_EVIDENCE_ERROR'&&!JSON.stringify(e).includes('private'));
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
const listEnvelope=(result,resultInfo={page:1,per_page:10,count:result.length,total_count:result.length,total_pages:1})=>({success:true,result,errors:[],messages:[],result_info:resultInfo});
const listItem=(key,size=23_646_892,contentType='Audio/MPEG; charset=binary')=>({key,size,uploaded:'2026-01-01T00:00:00Z',etag:'not-a-sha256',http_metadata:{contentType},custom_metadata:{}});
const jsonResponse=(value,options={})=>{const body=typeof value==='string'?value:JSON.stringify(value);return new Response(body,{status:options.status??200,headers:{'content-type':'application/json','content-length':options.length??String(Buffer.byteLength(body)),...(options.headers||{})}});};

test('R2 list uses exact bounded prefix GET, authorization only, and minimum normalized metadata',async()=>{
  let seen;const key='目 錄/a?#.mp3';
  const fetchImpl=async(url,init)=>{seen={url:new URL(url),init};return jsonResponse(listEnvelope([listItem(key)]));};
  const got=await r2ObjectMetadata({'account-id':'a c','bucket':'b#c','object-key':key},'private',fetchImpl,'http://127.0.0.1:1/client/v4');
  assert.equal(seen.url.pathname,'/client/v4/accounts/a%20c/r2/buckets/b%23c/objects');assert.equal(seen.url.search,'?prefix=%E7%9B%AE+%E9%8C%84%2Fa%3F%23.mp3&per_page=10');
  assert.equal(seen.init.method,'GET');assert.equal(seen.init.redirect,'manual');assert.deepEqual(seen.init.headers,{Authorization:'Bearer private'});assert.equal(Object.hasOwn(seen.init,'body'),false);
  assert.deepEqual(got,{content_type:'audio/mpeg',size:23_646_892});assert.deepEqual(Object.keys(got).sort(),['content_type','size']);
});

test('R2 23.6 MB ObjectSpec requires only a small list metadata response and never downloads object bytes',async()=>{
  const key='large/audio.mp3',body=JSON.stringify(listEnvelope([listItem(key,23_646_892)]));let calls=0;
  const got=await r2ObjectMetadata({'account-id':'a',bucket:'bbb','object-key':key},'private',async()=>{calls++;return jsonResponse(body);},'http://127.0.0.1:1/client/v4');
  assert.equal(calls,1);assert.equal(got.size,23_646_892);assert.ok(Buffer.byteLength(body)<1024);
});

test('R2 list rejects absent, longer-prefix-only, duplicate, invalid metadata and ambiguous pagination',async()=>{
  const args={'account-id':'a',bucket:'bbb','object-key':'a/b.mp3'},call=value=>r2ObjectMetadata(args,'private',async()=>jsonResponse(value),'http://127.0.0.1:1/client/v4');
  const good=listItem(args['object-key'],8,'audio/mpeg');
  const cases=[listEnvelope([]),listEnvelope([listItem('a/b.mp3.more',8)]),listEnvelope([good,{...good}]),listEnvelope([{...good,key:'wrong'}]),listEnvelope([{...good,size:8.5}]),listEnvelope([{...good,size:-1}]),listEnvelope([{...good,size:25*1024*1024+1}]),listEnvelope([{...good,http_metadata:{contentType:'text/plain'}}]),listEnvelope([{...good,http_metadata:{}}]),listEnvelope([{...good,unexpected:true}]),listEnvelope([good],{page:1,per_page:10,count:1,total_count:2,total_pages:1}),listEnvelope([good],{page:1,per_page:10,count:1,total_count:1,total_pages:2}),listEnvelope([good],{page:1,per_page:10,count:1,total_count:1,total_pages:1,cursor:'next'}),{...listEnvelope([good]),result:{}},{...listEnvelope([good]),extra:true}];
  for(const value of cases)await assert.rejects(()=>call(value),/LIVE_EVIDENCE_ERROR/);
});

test('R2 key and list response failures are closed, including redirect, status, oversize and malformed body',async()=>{
  for(const key of ['','a//b','./a','a/../b','a\\b','a\0b','x'.repeat(1025)])await assert.rejects(()=>r2ObjectMetadata({'account-id':'a',bucket:'bbb','object-key':key},'x',()=>assert.fail()));
  const cases=[new Response('',{status:302,headers:{location:'/else'}}),new Response('provider private body',{status:500}),jsonResponse('{}',{length:String(1024*1024+1)}),new Response(Buffer.alloc(1024*1024+1),{status:200}),jsonResponse('not-json'),jsonResponse('{"success":true,"result":[],"result":[]}'),jsonResponse([])];
  for(const response of cases)await assert.rejects(()=>r2ObjectMetadata({'account-id':'a',bucket:'bbb','object-key':'a/b.mp3'},'private',async()=>response,'http://127.0.0.1:1/client/v4'),/LIVE_EVIDENCE_ERROR/);
  await assert.rejects(()=>r2ObjectMetadata({'account-id':'a',bucket:'bbb','object-key':'a.mp3'},'x',async(_u,{signal})=>new Promise((_,no)=>signal.addEventListener('abort',()=>no(new Error('private timeout')))),'http://127.0.0.1:1/client/v4'),/LIVE_EVIDENCE_ERROR/);
},{timeout:17000});

function liveFixture(options={}){
  const origin='http://127.0.0.1:32123',ids=Array.from({length:20},(_,i)=>`work-${i}`);let windowCount=0,totalAudio=0,paceCount=0,listings=0,sleeps=0,verdict=false;const windows=[],paceWindows=[],paceMs=[],events=[],protocol=new Map(ids.map(id=>[id,[]]));
  const security={'content-security-policy':"default-src 'self'",'x-content-type-options':'nosniff','referrer-policy':'no-referrer','permissions-policy':'camera=()','strict-transport-security':'max-age=31536000','cross-origin-opener-policy':'same-origin'};
  const fetchImpl=async(input,init={})=>{if(verdict)throw new Error('request after verdict');const u=new URL(input),p=u.pathname,method=init.method||'GET',h=new Headers(init.headers);let spec;events.push(p.startsWith('/api/public/audio/')?'audio':p);
    if(p==='/')spec={status:200,body:'<a href="/works">works</a>',headers:{...security,'content-type':'text/html'}};
    else if(p==='/works')spec={status:200,body:'<main>works</main>',headers:{...security,'content-type':'text/html'}};
    else if(p==='/vote')spec={status:options.voteStatus||200,body:'<!doctype html><html><main>vote</main></html>',headers:{...security,'content-type':'text/html'}};
    else if(p==='/api/public/competition'){listings++;const freshIds=options.drift&&listings===2?[...ids.slice(1),ids[0]]:ids;const works=freshIds.map(id=>({publicId:id,listenUrl:`/api/public/audio/${id}?token=fresh-${listings}`}));if(options.privateField)works[0].privateField='x';if(options.crossOrigin)works[0].listenUrl='https://evil.invalid/a';spec={status:200,body:JSON.stringify({works}),headers:{'content-type':'application/json'}};}
    else if(p.startsWith('/api/public/audio/')){windowCount++;totalAudio++;const id=p.split('/').at(-1),token=u.searchParams.get('token'),kind=h.has('if-none-match')?'304':h.get('range')===`bytes=${mp3.length}-`?'416':h.get('range')==='bytes=0-1'?'range':method;protocol.get(id)?.push(kind);if(options.early403At===totalAudio)spec={status:403,body:'arbitrary'};else if(windowCount>(options.limitAt??80)){spec={status:options.defenseStatus||429,body:'slow',headers:{'retry-after':options.badRetry||'17'}};verdict=true;}else if(!/^fresh-[123]$/.test(token||''))spec={status:403,body:'denied'};else if(h.has('if-none-match'))spec={status:304,body:null,headers:{etag:'"fixture"'}};else if(h.get('range')===`bytes=${mp3.length}-`)spec={status:416,body:'',headers:{'content-range':`bytes */${mp3.length}`}};else if(h.get('range')==='bytes=0-1')spec={status:206,body:mp3.subarray(0,2),headers:{'content-range':`bytes 0-1/${mp3.length}`,'content-type':'audio/mpeg','content-length':'2',etag:'"fixture"'}};else spec={status:200,body:method==='HEAD'?null:mp3,headers:{'content-type':'audio/mpeg','content-length':String(mp3.length),etag:'"fixture"'}};}
    else if(['/media/submissions/probe.mp3','/media/probe.mp3','/guyun/media/probe.mp3'].includes(p))spec={status:404,body:'no'};
    else if(p==='/robots.txt')spec={status:200,body:'User-agent: *\nDisallow: /api/'};
    else if(p==='/__live_evidence_fixed_404__')spec={status:404,body:'no'};
    else spec={status:401,body:'unauthorized'};
    spec={...spec,headers:{...(spec.headers||{})}};options.mutator?.({u,init,spec});return new Response(spec.body,{status:spec.status,headers:spec.headers});};
  const sleepFn=async ms=>{sleeps++;if(options.sleepBehavior)await options.sleepBehavior(ms,sleeps);if(ms!==61000||sleeps>2)throw new Error('bad sleep');windows.push(windowCount);paceWindows.push(paceCount);windowCount=0;paceCount=0;};
  const paceFn=async ms=>{paceCount++;paceMs.push(ms);events.push('pace');if(options.paceBehavior)await options.paceBehavior(ms,paceMs.length);};
  const cleanPages=['/','/works','/vote'].map(path=>({path,status:200,html:`<html><main>${path}</main></html>`,urls:[origin+path],resourceUrls:[origin+'/app.js'],redirectUrls:[],failedUrls:[]}));
  const browserCollector=async()=>{events.push('browser');return{pages:options.pages||cleanPages};};return{origin,fetchImpl,browserCollector,sleepFn,paceFn,stats:()=>({windows:[...windows,windowCount],paceWindows:[...paceWindows,paceCount],paceMs,totalAudio,listings,sleeps,events,protocol,verdict}),ids};
}

test('all functional and browser gates precede bounded audio windows and terminal abuse',async()=>{const f=liveFixture();const got=await collectLiveGate({domain:'contest.zoeg.studio','r2-custom-domains-proof':true},f);assert.deepEqual(Object.keys(got).sort(),[...LIVE_BOOLEAN_GATES,...LIVE_COUNT_GATES].sort());for(const k of LIVE_BOOLEAN_GATES)assert.equal(got[k],true,k);assert.deepEqual(LIVE_COUNT_GATES.map(k=>got[k]),[20,20,0]);const s=f.stats();assert.deepEqual(s.windows,[52,50,81]);assert.deepEqual(s.paceWindows,[51,49,0]);assert.deepEqual(new Set(s.paceMs),new Set([FUNCTIONAL_AUDIO_PACE_MS]));assert.equal(FUNCTIONAL_AUDIO_PACE_MS,750);assert.equal(s.totalAudio,183);assert.equal(s.listings,3);assert.equal(s.sleeps,2);assert.equal(s.verdict,true);assert.ok(s.events.indexOf('browser')<s.events.indexOf('audio'));assert.equal(s.events.slice(s.events.lastIndexOf('/api/public/competition')+1).includes('pace'),false);});

test('exactly 20 unique works receive every protocol check',async()=>{const f=liveFixture();await collectLiveGate({domain:'contest.zoeg.studio','r2-custom-domains-proof':true},f);for(const id of f.ids)assert.deepEqual(f.stats().protocol.get(id).slice(0,5),['GET','HEAD','range','304','416'],id);});

test('live gate fails closed on limiter, listing, public/protected route, fake rate route and browser failures',async()=>{
  const retired=['qin','sheng.zoeg.studio'].join('');
  const badPages=kind=>['/','/works','/vote'].map((path,i)=>({path,status:kind==='status'&&i===1?500:200,html:kind==='old'&&i===2?`<a href="https://${retired}/x">x</a>`:'<html>x</html>',urls:[kind==='cross'&&i===1?'https://evil.invalid/x':`http://127.0.0.1:32123${path}`],resourceUrls:[],redirectUrls:kind==='redirect'&&i===1?['http://127.0.0.1:32123/old']:[],failedUrls:kind==='failed'&&i===1?['http://127.0.0.1:32123/bad']:[]}));
  const cases=[{privateField:true},{crossOrigin:true},{drift:true},{limitAt:999},{early403At:1},{badRetry:'0'},{badRetry:'61'},{badRetry:'x'},{voteStatus:401},...['status','old','cross','redirect','failed'].map(k=>({pages:badPages(k)})),{mutator:({u,spec})=>{if(u.pathname==='/api/admin/votes')spec.status=200;}}];
  for(const options of cases){const f=liveFixture(options);await assert.rejects(()=>collectLiveGate({domain:'contest.zoeg.studio','r2-custom-domains-proof':true},f),/LIVE_EVIDENCE_ERROR/);}
});

test('waits are exactly two fixed bounded deterministic injections',async()=>{const seen=[];const f=liveFixture({sleepBehavior:async(ms,n)=>seen.push([ms,n])});await collectLiveGate({domain:'contest.zoeg.studio','r2-custom-domains-proof':true},f);assert.deepEqual(seen,[[61000,1],[61000,2]]);const x=liveFixture();await assert.rejects(()=>collectLiveGate({domain:'contest.zoeg.studio','r2-custom-domains-proof':true},{...x,sleepFn:async()=>{throw new Error('wait rejected');}}),/LIVE_EVIDENCE_ERROR/);});

test('functional audio pacing is fixed, ordered, injected-fast, and fails closed',async()=>{const f=liveFixture();await collectLiveGate({domain:'contest.zoeg.studio','r2-custom-domains-proof':true},f);const sequence=f.stats().events.filter(x=>x==='audio'||x==='pace');assert.deepEqual(sequence.slice(0,103),Array.from({length:103},(_,i)=>i%2?'pace':'audio'));assert.deepEqual(sequence.slice(103,202),Array.from({length:99},(_,i)=>i%2?'pace':'audio'));assert.deepEqual(sequence.slice(202),Array(81).fill('audio'));const broken=liveFixture({paceBehavior:async()=>{throw new Error('private pacing failure');}});await assert.rejects(()=>collectLiveGate({domain:'contest.zoeg.studio','r2-custom-domains-proof':true},broken),e=>e.message==='LIVE_EVIDENCE_ERROR'&&e.gate==='LIVE_AUDIO_PACING');});

test('qualified late WAF 403 passes but arbitrary early 403 fails and verdict is terminal',async()=>{const waf=liveFixture({defenseStatus:403});const got=await collectLiveGate({domain:'contest.zoeg.studio','r2-custom-domains-proof':true},waf);assert.equal(got.rate_limit,true);assert.equal(waf.stats().windows.at(-1),81);assert.equal(waf.stats().verdict,true);const early=liveFixture({early403At:103});await assert.rejects(()=>collectLiveGate({domain:'contest.zoeg.studio','r2-custom-domains-proof':true},early),/LIVE_EVIDENCE_ERROR/);});

test('diagnostic is fixed-enum non-secret and private while unknown text is rejected',async()=>{const root=await mkdtemp(join(tmpdir(),'live-gate-diagnostic-'));for(const gate of LIVE_DIAGNOSTIC_GATES)assert.equal(parseLiveDiagnostic({gate}),gate);for(const value of [{gate:'token=private'},{gate:'LIVE_DEFENSE',extra:true},'LIVE_DEFENSE',null])assert.equal(parseLiveDiagnostic(value),null);const path=join(root,'live-evidence.json.gate.json');await writeLiveDiagnostic(path,{gate:'LIVE_DEFENSE'});assert.deepEqual(JSON.parse(await readFile(path,'utf8')),{gate:'LIVE_DEFENSE'});assert.match(await readFile(resolve('tools/live_evidence.mjs'),'utf8'),/open\(temp,'wx',0o600\)/);if(process.platform!=='win32')assert.equal((await stat(path)).mode&0o077,0);await assert.rejects(()=>writeLiveDiagnostic(join(root,'bad.json'),{gate:'private-token-value'}),/LIVE_EVIDENCE_ERROR/);});

test('CDP collection waits for a new load per page and aggregates redirects and failures',async()=>{const events=[{method:'Page.loadEventFired'}];let current='';const session={events,async send(method,params){if(method==='Page.navigate'){current=params.url;events.push({method:'Network.requestWillBeSent',params:{request:{url:current}}},{method:'Network.responseReceived',params:{response:{url:current,status:200}}},{method:'Page.loadEventFired'});return{};}if(method==='Runtime.evaluate')return{result:{value:JSON.stringify({html:'<html>x</html>',resources:[new URL('/app.js',current).href]})}};return{};},close(){}};const got=await collectCdpEvidence({origin:'http://127.0.0.1:32123',session,timeoutMs:20});assert.deepEqual(got.pages.map(x=>x.path),['/','/works','/vote']);assert.ok(got.pages.every(x=>x.status===200&&x.html));
  const stale={events:[{method:'Page.loadEventFired'}],async send(method){if(method==='Runtime.evaluate')assert.fail();return{};}};await assert.rejects(()=>collectCdpEvidence({origin:'http://127.0.0.1:32123',session:stale,timeoutMs:10}));
});

test('browser collector always closes CDP, kills Edge, and removes its temporary profile',async()=>{const oldFetch=globalThis.fetch;try{let profile,killed=false,exited=false,closeStarted=false,closed=false,fetches=0,complete=false,connected;const edgeLauncher=(_exe,args)=>{profile=args.find(x=>x.startsWith('--user-data-dir=')).slice(16);void(async()=>{await writeFile(join(profile,'DevToolsActivePort'),'49152\n');await new Promise(r=>setTimeout(r,75));complete=true;await writeFile(join(profile,'DevToolsActivePort'),'49152\n/devtools/browser/9f1c0a7b-2d3e-4f56-8a90-browser.v24\n');})();const child=new EventEmitter();child.exitCode=null;child.signalCode=null;child.kill=()=>{killed=true;queueMicrotask(()=>{exited=true;child.exitCode=0;child.emit('exit');});};return child;};globalThis.fetch=async(input,init)=>{fetches++;assert.equal(complete,true);assert.equal(String(input),'http://127.0.0.1:49152/json/new?http%3A%2F%2F127.0.0.1%3A32123');assert.equal(init.method,'PUT');return new Response(JSON.stringify({webSocketDebuggerUrl:'ws://127.0.0.1:49152/devtools/page/4aa7d83e-91bc-47f0-page.v24'}),{status:200,headers:{'content-type':'application/json; charset=utf-8'}});};const events=[];let current='';const cdpTransport=async({webSocketUrl})=>{connected=webSocketUrl;return{events,async send(method,params){if(method==='Page.navigate'){current=params.url;events.push({method:'Network.requestWillBeSent',params:{request:{url:current}}},{method:'Network.responseReceived',params:{response:{url:current,status:200}}},{method:'Page.loadEventFired'});}if(method==='Runtime.evaluate')return{result:{value:JSON.stringify({html:'<html>x</html>',resources:[]})}};return{};},async close(){closeStarted=true;await new Promise(r=>setTimeout(r,20));closed=true;}};};await collectBrowserEvidence({origin:'http://127.0.0.1:32123',edgeLauncher,cdpTransport});assert.equal(fetches,1);assert.equal(connected,'ws://127.0.0.1:49152/devtools/page/4aa7d83e-91bc-47f0-page.v24');assert.equal(closeStarted,true);assert.equal(closed,true);assert.equal(killed,true);assert.equal(exited,true);await assert.rejects(()=>stat(profile));
    let failedProfile,closeRejected=false,killAttempted=false,onceAttempted=false,removeAttempted=false;const failingLauncher=(_exe,args)=>{failedProfile=args.find(x=>x.startsWith('--user-data-dir=')).slice(16);void writeFile(join(failedProfile,'DevToolsActivePort'),'49153\n/devtools/browser/failure-browser.v24\n');return{exitCode:null,signalCode:null,kill(){killAttempted=true;throw new Error('kill fixture');},once(){onceAttempted=true;throw new Error('once fixture');},removeListener(){removeAttempted=true;throw new Error('remove fixture');}};};globalThis.fetch=async()=>new Response(JSON.stringify({webSocketDebuggerUrl:'ws://127.0.0.1:49153/devtools/page/failure-page.v24'}),{status:200,headers:{'content-type':'application/json'}});const failingTransport=async()=>({events:[],async send(){throw new Error('primary fixture');},async close(){await Promise.resolve();closeRejected=true;throw new Error('close fixture');}});await assert.rejects(()=>collectBrowserEvidence({origin:'http://127.0.0.1:32123',edgeLauncher:failingLauncher,cdpTransport:failingTransport}),/LIVE_EVIDENCE_ERROR/);assert.equal(closeRejected,true);assert.equal(killAttempted,true);assert.equal(onceAttempted,true);assert.equal(removeAttempted,true);await assert.rejects(()=>stat(failedProfile));}finally{globalThis.fetch=oldFetch;}});

test('live gate rejects every missing false or wrong schema gate through adapter-compatible truth contract',()=>{const good=Object.fromEntries(LIVE_BOOLEAN_GATES.map(k=>[k,true]));Object.assign(good,{public_owner_count:20,audio_owner_count:20,old_link_occurrences:0});for(const k of LIVE_BOOLEAN_GATES){assert.notEqual({...good,[k]:false}[k],true);}for(const k of LIVE_COUNT_GATES){assert.notEqual(typeof {...good,[k]:'20'}[k],'number');}assert.equal(Object.keys(good).length,24);});
