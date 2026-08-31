import { chmod, lstat, mkdtemp, open, readFile, realpath, rename, rm, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

const API = 'https://api.cloudflare.com/client/v4';
const CANONICAL = 'contest.zoeg.studio';
const ORIGIN = `https://${CANONICAL}`;
const MAX_BODY = 1024 * 1024;
const MAX_OBJECT = 9_671_575 + 65_536; // largest reviewed production manifest object + narrow margin
const TIMEOUT_MS = 15_000;
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMMON = ['mode', 'output', 'nonce'];
const MODES = Object.freeze({
  'cloudflare-preflight': [...COMMON, 'account-id', 'zone-id', 'worker', 'd1-name', 'd1-id', 'r2-bucket', 'domain'],
  'r2-object-metadata': [...COMMON, 'account-id', 'bucket', 'object-key'],
  'r2-public-access': [...COMMON, 'account-id', 'bucket'],
  'live-gate': [...COMMON, 'domain', 'r2-custom-domains-proof'],
});
export const LIVE_BOOLEAN_GATES = Object.freeze(['homepage','works','public_owners','audio_get','audio_head','audio_range','audio_etag','audio_304','audio_416','tamper_denied','expiry_denied','legacy_static_denied','robots','not_found_404','rate_limit','csp','security_headers','owner_model','protected_routes_fail_closed','browser_dom_inventory','browser_network_inventory']);
export const LIVE_COUNT_GATES = Object.freeze(['public_owner_count','audio_owner_count','old_link_occurrences']);

export class EvidenceError extends Error {}
const fail = () => { throw new EvidenceError('LIVE_EVIDENCE_ERROR'); };

export function parseArgs(argv) {
  const out = Object.create(null);
  for (let i = 0; i < argv.length;) {
    const flag = argv[i]; if (typeof flag !== 'string' || !flag.startsWith('--')) fail();
    const key = flag.slice(2); if (Object.hasOwn(out, key)) fail();
    if (key === 'r2-custom-domains-proof') { out[key] = true; i++; continue; }
    if (i + 1 >= argv.length || typeof argv[i + 1] !== 'string' || !argv[i + 1] || argv[i + 1].startsWith('--')) fail();
    out[key] = argv[i + 1]; i += 2;
  }
  if (!Object.hasOwn(MODES, out.mode) || Object.keys(out).length !== MODES[out.mode].length || MODES[out.mode].some(k => !Object.hasOwn(out,k))) fail();
  if (!/^[0-9a-f]{64}$/.test(out.nonce) || !isAbsolute(out.output)) fail();
  if (out.mode === 'live-gate' && (out.domain !== CANONICAL || out['r2-custom-domains-proof'] !== true)) fail();
  if (out.mode === 'cloudflare-preflight' && out.domain !== CANONICAL) fail();
  return out;
}

async function safeOutput(path) {
  const target = resolve(path); if (target.startsWith(repo + sep) || target === repo) fail();
  try { await lstat(target); fail(); } catch (e) { if (e instanceof EvidenceError || e?.code !== 'ENOENT') throw e; }
  const parent = await realpath(dirname(target)).catch(fail); if (parent.startsWith(repo + sep) || parent === repo) fail();
  let cursor=parse(parent).root; for(const part of parent.slice(cursor.length).split(sep).filter(Boolean)){cursor=join(cursor,part);const i=await lstat(cursor).catch(fail);if(i.isSymbolicLink() || (i.mode & 0o170000)===0o120000 || (i.fileAttributes & 0x400))fail();}
  return {target,parent};
}
function depth(v,l=0){if(l>12)fail();if(Array.isArray(v)){if(v.length>10000)fail();for(const x of v)depth(x,l+1);}else if(v&&typeof v==='object'){const k=Object.keys(v);if(k.length>256)fail();for(const x of k)depth(v[x],l+1);}}
async function timedFetch(fetchImpl,url,init={}){const c=new AbortController(),t=setTimeout(()=>c.abort(),TIMEOUT_MS);try{return await fetchImpl(url,{...init,redirect:'manual',signal:c.signal});}catch{fail();}finally{clearTimeout(t);}}
async function apiJson(path,token,fetchImpl,apiBase=API){
  const url=new URL(path,apiBase+'/'); if(apiBase===API && (url.origin!=='https://api.cloudflare.com'||!url.pathname.startsWith('/client/v4/')))fail();
  const r=await timedFetch(fetchImpl,url,{headers:{Authorization:`Bearer ${token}`}}); if(r.status<200||r.status>=300||Number(r.headers.get('content-length'))>MAX_BODY)fail();
  const b=new Uint8Array(await r.arrayBuffer());if(b.length>MAX_BODY)fail();let v;try{v=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));}catch{fail();}depth(v);if(v?.success!==true||!Object.hasOwn(v,'result'))fail();return v.result;
}
const enc=encodeURIComponent;
export async function cloudflarePreflight(a,token,fetchImpl=fetch,apiBase=API){const account=await apiJson('user/tokens/verify',token,fetchImpl,apiBase),zone=await apiJson(`zones/${enc(a['zone-id'])}`,token,fetchImpl,apiBase),worker=await apiJson(`accounts/${enc(a['account-id'])}/workers/services/${enc(a.worker)}`,token,fetchImpl,apiBase),d1=await apiJson(`accounts/${enc(a['account-id'])}/d1/database/${enc(a['d1-id'])}`,token,fetchImpl,apiBase),r2=await apiJson(`accounts/${enc(a['account-id'])}/r2/buckets/${enc(a['r2-bucket'])}`,token,fetchImpl,apiBase),domains=await apiJson(`accounts/${enc(a['account-id'])}/workers/domains`,token,fetchImpl,apiBase);const am=account?.status==='active',zm=zone?.id===a['zone-id']&&zone?.account?.id===a['account-id'],wm=worker?.default_environment?.script?.name===a.worker||worker?.name===a.worker,dm=d1?.uuid===a['d1-id']&&d1?.name===a['d1-name'],rm=r2?.name===a['r2-bucket'],cm=Array.isArray(domains)&&domains.some(x=>x?.service===a.worker&&x?.hostname===CANONICAL&&x?.zone_id===a['zone-id']);return{account_match:am,zone_match:zm,worker_match:wm,d1_match:dm,r2_match:rm,canonical_domain_match:cm,resource_ids_match:zm&&dm};}
export async function publicAccess(a,token,fetchImpl=fetch,apiBase=API){const root=`accounts/${enc(a['account-id'])}/r2/buckets/${enc(a.bucket)}/domains/`,m=await apiJson(root+'managed',token,fetchImpl,apiBase),c=await apiJson(root+'custom',token,fetchImpl,apiBase);return{dev_url_disabled:m?.enabled===false,custom_domains_disabled:c&&Object.keys(c).length===1&&Array.isArray(c.domains)&&c.domains.length===0};}

function objectPath(key){if(typeof key!=='string'||key.length<1||key.length>1024||/[\\\u0000-\u001f\u007f]/u.test(key))fail();const parts=key.split('/');if(parts.some(x=>!x||x==='.'||x==='..'))fail();return parts.map(enc).join('/');}
function normalizedMime(v){if(typeof v!=='string')fail();return v.split(';',1)[0].trim().toLowerCase();}
function magicOk(m,b){if(m==='audio/mpeg')return (b[0]===0x49&&b[1]===0x44&&b[2]===0x33)||(b[0]===0xff&&(b[1]&0xe0)===0xe0);if(m==='audio/wav'||m==='audio/x-wav')return b.subarray(0,4).toString()==='82,73,70,70'&&b.subarray(8,12).toString()==='87,65,86,69';if(m==='audio/ogg')return b.subarray(0,4).toString()==='79,103,103,83';if(m==='audio/mp4'||m==='audio/x-m4a')return b.length>=12&&b[4]===0x66&&b[5]===0x74&&b[6]===0x79&&b[7]===0x70;return false;}
export async function r2ObjectMetadata(a,token,fetchImpl=fetch,apiBase=API){
  const path=`accounts/${enc(a['account-id'])}/r2/buckets/${enc(a.bucket)}/objects/${objectPath(a['object-key'])}`;const url=new URL(path,apiBase+'/');if(apiBase===API&&(url.origin!=='https://api.cloudflare.com'||!url.pathname.startsWith('/client/v4/')))fail();
  const r=await timedFetch(fetchImpl,url,{method:'GET',headers:{Authorization:`Bearer ${token}`}});if(r.status<200||r.status>=300)fail();const declared=r.headers.get('content-length');if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>MAX_OBJECT))fail();
  const mime=normalizedMime(r.headers.get('content-type'));if(!['audio/mpeg','audio/wav','audio/x-wav','audio/ogg','audio/mp4','audio/x-m4a'].includes(mime)||!r.body)fail();
  const hash=createHash('sha256'),prefix=[];let size=0;const reader=r.body.getReader();try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_OBJECT){await reader.cancel();fail();}hash.update(value);for(const x of value)if(prefix.length<16)prefix.push(x);}}catch(e){if(e instanceof EvidenceError)throw e;fail();}
  if(declared!==null&&Number(declared)!==size)fail();if(!magicOk(mime,Uint8Array.from(prefix)))fail();return{content_type:mime,size,sha256:hash.digest('hex')};
}

const forbiddenHost = /(?:sslip|qinsheng\.zoeg\.studio|161-33-|185-80)/i;
function sameOrigin(value,origin){try{return new URL(value,origin).origin===new URL(origin).origin;}catch{return false;}}
async function bodyBytes(r,limit=MAX_OBJECT){if(!r.body)return Buffer.alloc(0);const out=[];let n=0;for await(const c of r.body){n+=c.length;if(n>limit)fail();out.push(c);}return Buffer.concat(out,n);}
async function request(fetchImpl,origin,path,init={}){const u=new URL(path,origin);if(u.origin!==new URL(origin).origin)fail();return timedFetch(fetchImpl,u,init);}
function headersOk(h){return h.get('x-content-type-options')?.toLowerCase()==='nosniff'&&!!h.get('referrer-policy')&&!!h.get('permissions-policy')&&!!h.get('content-security-policy')&&!!h.get('strict-transport-security')&&h.get('cross-origin-opener-policy')?.toLowerCase()==='same-origin';}
function genericFailure(r,text){return [401,403,404,503].includes(r.status)&&!/(stack|exception|secret|token|discord|database|d1|r2|cloudflare)/i.test(text);}

function publicItems(value,origin){
  const items=value?.works,allowed=new Set(['publicId','listenUrl']);
  if(!Array.isArray(items)||items.length!==20||!items.every(x=>x&&Object.keys(x).length===2&&Object.keys(x).every(k=>allowed.has(k))&&typeof x.publicId==='string'&&typeof x.listenUrl==='string'&&sameOrigin(x.listenUrl,origin)))fail();
  const ids=items.map(x=>x.publicId);if(new Set(ids).size!==20)fail();return{items,ids};
}
async function listing(fetchImpl,origin){const r=await request(fetchImpl,origin,'/api/public/competition?contest=guyun');let value;try{value=JSON.parse((await bodyBytes(r,MAX_BODY)).toString('utf8'));}catch{fail();}if(r.status!==200)fail();return publicItems(value,origin);}
async function verifyAudio(fetchImpl,origin,item,checks){
  const u=new URL(item.listenUrl,origin),path=u.pathname+u.search;
  const get=await request(fetchImpl,origin,path),bytes=await bodyBytes(get),etag=get.headers.get('etag'),len=get.headers.get('content-length'),type=normalizedMime(get.headers.get('content-type'));
  checks.get&&=get.status===200&&Number(len)===bytes.length&&magicOk(type,bytes.subarray(0,16));
  const head=await request(fetchImpl,origin,path,{method:'HEAD'});checks.head&&=head.status===200&&(await bodyBytes(head)).length===0&&head.headers.get('content-length')===len&&head.headers.get('content-type')===get.headers.get('content-type');
  const range=await request(fetchImpl,origin,path,{headers:{Range:'bytes=0-1'}}),rb=await bodyBytes(range);checks.range&&=range.status===206&&rb.length===2&&range.headers.get('content-range')===`bytes 0-1/${bytes.length}`;
  checks.etag&&=typeof etag==='string'&&etag.length>2;const n304=await request(fetchImpl,origin,path,{headers:{'If-None-Match':etag||'invalid'}});checks.n304&&=n304.status===304&&(await bodyBytes(n304)).length===0;
  const n416=await request(fetchImpl,origin,path,{headers:{Range:`bytes=${bytes.length}-`}});checks.n416&&=n416.status===416&&n416.headers.get('content-range')===`bytes */${bytes.length}`;
}

export async function collectLiveGate(a,{fetchImpl=fetch,origin=ORIGIN,browserCollector=collectBrowserEvidence,edgeLauncher=spawn,cdpTransport,sleepFn=ms=>new Promise(r=>setTimeout(r,ms))}={}){
  if(a.domain!==CANONICAL||a['r2-custom-domains-proof']!==true)fail();const injected=origin!==ORIGIN;if(!injected)origin=ORIGIN;
  const result=Object.fromEntries(LIVE_BOOLEAN_GATES.map(x=>[x,false]));Object.assign(result,{public_owner_count:0,audio_owner_count:0,old_link_occurrences:0});
  const home=await request(fetchImpl,origin,'/'),works=await request(fetchImpl,origin,'/works');const homeText=(await bodyBytes(home,MAX_BODY)).toString('utf8'),worksText=(await bodyBytes(works,MAX_BODY)).toString('utf8');
  result.homepage=home.status===200;result.works=works.status===200&&/href=["']\/works["']/.test(homeText);result.csp=!!home.headers.get('content-security-policy')&&!!works.headers.get('content-security-policy');result.security_headers=headersOk(home.headers)&&headersOk(works.headers);
  const first=await listing(fetchImpl,origin),items=first.items,ids=first.ids;result.owner_model=true;
  result.public_owner_count=ids.length;result.public_owners=true;result.audio_owner_count=items.length;
  const checks={get:true,head:true,range:true,etag:true,n304:true,n416:true,tamper:true,expiry:true};
  for(const item of items.slice(0,4))await verifyAudio(fetchImpl,origin,item,checks);
  const firstUrl=new URL(items[0].listenUrl,origin),bad=new URL(firstUrl);bad.searchParams.set('token',(bad.searchParams.get('token')||'x')+'x');checks.tamper=[401,403].includes((await request(fetchImpl,origin,bad.pathname+bad.search)).status);
  const expired=new URL(firstUrl);expired.searchParams.set('token','expired.0.invalid');checks.expiry=[401,403].includes((await request(fetchImpl,origin,expired.pathname+expired.search)).status);
  const waitMs=61_000;if(waitMs>65_000)fail();try{await sleepFn(waitMs);}catch{fail();}
  const fresh=await listing(fetchImpl,origin);if(fresh.ids.some((id,i)=>id!==ids[i]))fail();
  for(const item of fresh.items.slice(4))await verifyAudio(fetchImpl,origin,item,checks);
  const probeUrl=new URL(fresh.items[4].listenUrl,origin),probe=await request(fetchImpl,origin,probeUrl.pathname+probeUrl.search,{method:'HEAD'}),retry=probe.headers.get('retry-after');
  result.rate_limit=probe.status===429&&/^\d+$/.test(retry||'')&&Number(retry)>=1&&Number(retry)<=60;
  Object.assign(result,{audio_get:checks.get,audio_head:checks.head,audio_range:checks.range,audio_etag:checks.etag,audio_304:checks.n304,audio_416:checks.n416,tamper_denied:checks.tamper,expiry_denied:checks.expiry});
  result.legacy_static_denied=(await Promise.all(['/media/submissions/probe.mp3','/media/probe.mp3','/guyun/media/probe.mp3'].map(p=>request(fetchImpl,origin,p)))).every(r=>[403,404].includes(r.status));
  const robots=await request(fetchImpl,origin,'/robots.txt'),robotText=(await bodyBytes(robots,MAX_BODY)).toString('utf8');result.robots=robots.status===200&&/Disallow:\s*\/api\//i.test(robotText);result.not_found_404=(await request(fetchImpl,origin,'/__live_evidence_fixed_404__')).status===404;
  const vote=await request(fetchImpl,origin,'/vote'),voteText=(await bodyBytes(vote,MAX_BODY)).toString('utf8');if(vote.status!==200||!/^\s*<!doctype html|<html[\s>]/i.test(voteText))fail();
  const protectedSpecs=[['GET','/register'],['GET','/admin'],['GET','/api/me/registration'],['POST','/api/registration'],['PUT','/api/registration/1'],['GET','/api/me/vote'],['PUT','/api/me/vote'],['POST','/auth/logout'],['GET','/api/admin/overview'],['GET','/api/admin/registrations'],['PUT','/api/admin/registrations/1'],['GET','/api/admin/votes'],['GET','/api/admin/audit'],['GET','/api/admin/export'],['GET','/api/admin/settings'],['PUT','/api/admin/settings'],['GET','/api/admin/schedule'],['PUT','/api/admin/schedule']];result.protected_routes_fail_closed=true;for(const [method,p]of protectedSpecs){const r=await request(fetchImpl,origin,p,{method});const text=(await bodyBytes(r,MAX_BODY)).toString('utf8');result.protected_routes_fail_closed&&=genericFailure(r,text);}
  const browser=await browserCollector({origin,allowInjectedOrigin:injected,edgeLauncher,cdpTransport}),pages=browser.pages;if(!Array.isArray(pages)||pages.length!==3||pages.some((p,i)=>p.path!==['/','/works','/vote'][i]||p.status!==200||!String(p.html).trim()))fail();
  const urls=pages.flatMap(p=>[...(p.urls||[]),...(p.resourceUrls||[])]),texts=pages.flatMap(p=>[p.html,...(p.redirectUrls||[]),...(p.failedUrls||[])]),all=[...urls,...texts];let old=0;for(const value of all){const s=String(value);old+=(s.match(new RegExp(forbiddenHost.source,'ig'))||[]).length;for(const match of s.matchAll(/https?:\/\/[^\s"'<>]+/ig))if(!sameOrigin(match[0],origin))old++;if(/challenges\.cloudflare\.com/i.test(s))old++;}old+=pages.reduce((n,p)=>n+(p.redirectUrls?.length||0)+(p.failedUrls?.length||0),0);result.old_link_occurrences=old;result.browser_network_inventory=urls.length>0&&old===0&&urls.every(x=>sameOrigin(x,origin));result.browser_dom_inventory=old===0&&pages.every(p=>String(p.html).length>0&&!/(?:href|src|action)=["'](?:https?:)?\/\//i.test(String(p.html).replaceAll(origin,'')));
  if(Object.keys(result).length!==LIVE_BOOLEAN_GATES.length+LIVE_COUNT_GATES.length||LIVE_BOOLEAN_GATES.some(k=>result[k]!==true)||result.public_owner_count!==20||result.audio_owner_count!==20||result.old_link_occurrences!==0)fail();return result;
}

const EDGE_PATHS=['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
async function webSocketSession(webSocketUrl){
  const ws=new WebSocket(webSocketUrl),events=[],pending=new Map();let id=0;
  await new Promise((ok,no)=>{const t=setTimeout(no,TIMEOUT_MS);ws.onopen=()=>{clearTimeout(t);ok();};ws.onerror=no;});
  ws.onmessage=e=>{let m;try{m=JSON.parse(e.data);}catch{return;}if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}else events.push(m);};
  return{events,send:(method,params={})=>new Promise((ok,no)=>{const n=++id,t=setTimeout(()=>{pending.delete(n);no(new Error());},TIMEOUT_MS);pending.set(n,m=>{clearTimeout(t);m.error?no(new Error()):ok(m.result);});ws.send(JSON.stringify({id:n,method,params}));}),close:()=>ws.close()};
}
export async function collectCdpEvidence({origin,session,timeoutMs=TIMEOUT_MS}){
  const {send,events}=session;for(const d of ['Network.enable','Page.enable','Runtime.enable','Performance.enable'])await send(d);const pages=[];
  for(const path of ['/','/works','/vote']){const url=new URL(path,origin).href,start=events.length;await send('Page.navigate',{url});await new Promise((ok,no)=>{const began=Date.now();const tick=()=>events.slice(start).some(e=>e.method==='Page.loadEventFired')?ok():Date.now()-began>timeoutMs?no(new Error()):setTimeout(tick,5);tick();});
    const pageEvents=events.slice(start),evaluated=await send('Runtime.evaluate',{expression:'JSON.stringify({html:document.documentElement.outerHTML,resources:performance.getEntriesByType("resource").map(x=>x.name)})',returnByValue:true});let snap;try{snap=JSON.parse(evaluated.result.value);}catch{fail();}
    const responses=pageEvents.filter(e=>e.method==='Network.responseReceived').map(e=>e.params.response),main=responses.find(r=>r?.url===url);const urls=pageEvents.filter(e=>['Network.requestWillBeSent','Network.responseReceived'].includes(e.method)).map(e=>e.params.request?.url||e.params.response?.url).filter(Boolean),redirectUrls=pageEvents.filter(e=>e.method==='Network.requestWillBeSent'&&e.params.redirectResponse).flatMap(e=>[e.params.redirectResponse.url,e.params.request?.url]).filter(Boolean),failedUrls=pageEvents.filter(e=>e.method==='Network.loadingFailed').map(e=>e.params.url||e.params.request?.url||`request:${e.params.requestId}`).filter(Boolean);
    pages.push({path,status:main?.status,html:snap.html,resourceUrls:snap.resources,urls,redirectUrls,failedUrls});
  }return{pages};
}
export async function collectBrowserEvidence({origin,edgeLauncher=spawn,cdpTransport}){let edge,temp,session;try{let executable;for(const p of EDGE_PATHS){try{const i=await lstat(p);if(i.isFile()){executable=p;break;}}catch{}}if(!executable)fail();temp=await mkdtemp(join(tmpdir(),'live-edge-'));edge=edgeLauncher(executable,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${temp}`,'about:blank'],{shell:false,stdio:'ignore'});const deadline=Date.now()+TIMEOUT_MS;let active;while(Date.now()<deadline){try{active=await readFile(join(temp,'DevToolsActivePort'),'utf8');break;}catch{await new Promise(r=>setTimeout(r,50));}}if(!active)fail();const [port,path]=active.trim().split(/\r?\n/);if(!/^\d+$/.test(port)||!path?.startsWith('/'))fail();const list=await timedFetch(fetch,`http://127.0.0.1:${port}/json/new?${encodeURIComponent(origin)}`,{method:'PUT'}),target=await list.json();if(!target.webSocketDebuggerUrl?.startsWith(`ws://127.0.0.1:${port}/`))fail();session=cdpTransport?await cdpTransport({webSocketUrl:target.webSocketDebuggerUrl,origin}):await webSocketSession(target.webSocketDebuggerUrl);return await collectCdpEvidence({origin,session});}catch{fail();}finally{try{session?.close?.();}catch{}if(edge){edge.kill();await new Promise(r=>{edge.once('exit',r);setTimeout(r,1000);});}if(temp)await rm(temp,{recursive:true,force:true}).catch(()=>{});}}

async function runMode(a,token){if(a.mode==='cloudflare-preflight')return cloudflarePreflight(a,token);if(a.mode==='r2-public-access')return publicAccess(a,token);if(a.mode==='r2-object-metadata')return r2ObjectMetadata(a,token);if(a.mode==='live-gate')return collectLiveGate(a);fail();}
async function atomicWrite(path,envelope){const{target,parent}=await safeOutput(path),temp=join(parent,`.live-evidence-${randomBytes(16).toString('hex')}`);let h;try{h=await open(temp,'wx',0o600);await h.writeFile(JSON.stringify(envelope));await h.sync();await h.close();h=undefined;await chmod(temp,0o600).catch(()=>{});await rename(temp,target);const d=await open(parent,'r').catch(()=>null);if(d){await d.sync().catch(()=>{});await d.close();}}catch(e){if(h)await h.close().catch(()=>{});await unlink(temp).catch(()=>{});throw e;}}
export async function main(argv=process.argv.slice(2)){const a=parseArgs(argv),token=process.env.CLOUDFLARE_API_TOKEN;if(typeof token!=='string'||!token)fail();await safeOutput(a.output);const result=await runMode(a,token);await atomicWrite(a.output,{nonce:a.nonce,result});}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{process.stderr.write('LIVE_EVIDENCE_ERROR\n');process.exitCode=1;});
