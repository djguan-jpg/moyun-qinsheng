import { chmod, lstat, mkdtemp, open, readFile, realpath, rename, rm, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

const API = 'https://api.cloudflare.com/client/v4';
const CANONICAL = 'contest.zoeg.studio';
const ORIGIN = `https://${CANONICAL}`;
const MAX_BODY = 1024 * 1024;
const MAX_SQL = 1024 * 1024;
const MAX_OBJECT = 25 * 1024 * 1024; // keep live evidence aligned with the Worker upload cap
const TIMEOUT_MS = 15_000;
const AUDIO_WINDOW_WAIT_MS = 61_000;
export const FUNCTIONAL_AUDIO_PACE_MS = 750;
const MAX_AUDIO_REQUESTS_PER_WINDOW = 80;
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMMON = ['mode', 'output', 'nonce'];
const MODES = Object.freeze({
  'cloudflare-preflight': [...COMMON, 'account-id', 'zone-id', 'worker', 'd1-name', 'd1-id', 'r2-bucket', 'domain'],
  'd1-query': [...COMMON, 'account-id', 'd1-id', 'sql-file'],
  'r2-object-metadata': [...COMMON, 'account-id', 'bucket', 'object-key'],
  'r2-public-access': [...COMMON, 'account-id', 'bucket'],
  'live-gate': [...COMMON, 'domain', 'r2-custom-domains-proof'],
});
export const LIVE_BOOLEAN_GATES = Object.freeze(['homepage','works','public_owners','audio_get','audio_head','audio_range','audio_etag','audio_304','audio_416','tamper_denied','expiry_denied','legacy_static_denied','robots','not_found_404','rate_limit','csp','security_headers','owner_model','protected_routes_fail_closed','browser_dom_inventory','browser_network_inventory']);
export const LIVE_COUNT_GATES = Object.freeze(['public_owner_count','audio_owner_count','old_link_occurrences']);
export const LIVE_DIAGNOSTIC_GATES = Object.freeze(['LIVE_SETUP','LIVE_NON_VOLUME','LIVE_AUDIO_WINDOW_1','LIVE_AUDIO_WINDOW_WAIT_1','LIVE_AUDIO_WINDOW_2','LIVE_AUDIO_WINDOW_WAIT_2','LIVE_AUDIO_PACING','LIVE_DEFENSE']);

export class EvidenceError extends Error { constructor(message,gate){super(message);this.gate=gate;} }
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
  if (!/^[0-9a-f]{64}$/.test(out.nonce) || !isAbsolute(out.output) || (out.mode === 'd1-query' && !isAbsolute(out['sql-file']))) fail();
  if (out.mode === 'live-gate' && (out.domain !== CANONICAL || out['r2-custom-domains-proof'] !== true)) fail();
  if (out.mode === 'cloudflare-preflight' && out.domain !== CANONICAL) fail();
  return out;
}

async function privateRegularFile(path) {
  const inside=p=>{const a=process.platform==='win32'?p.toLowerCase():p,b=process.platform==='win32'?repo.toLowerCase():repo;return a===b||a.startsWith(b+sep);};
  if(!isAbsolute(path))fail();const supplied=resolve(path);if(inside(supplied))fail();
  const parent=await realpath(dirname(supplied)).catch(fail),parentInfo=await lstat(parent).catch(fail);if(inside(parent)||!parentInfo.isDirectory()||(process.platform!=='win32'&&(parentInfo.mode&0o077)!==0))fail();
  let cursor=parse(parent).root;for(const part of parent.slice(cursor.length).split(sep).filter(Boolean)){cursor=join(cursor,part);const i=await lstat(cursor).catch(fail);if(i.isSymbolicLink()||(i.mode&0o170000)===0o120000||(i.fileAttributes&0x400))fail();}
  const before=await lstat(supplied).catch(fail);if(!before.isFile()||before.isSymbolicLink()||(before.fileAttributes&0x400)||(process.platform!=='win32'&&(before.mode&0o077)!==0)||before.size<1||before.size>MAX_SQL)fail();
  const actual=await realpath(supplied).catch(fail);if(inside(actual))fail();
  const bytes=await readFile(supplied).catch(fail),after=await lstat(supplied).catch(fail);if(bytes.length!==before.size||after.size!==before.size||after.mtimeMs!==before.mtimeMs)fail();return bytes;
}

function validateReadOnlySql(sql){
  if(typeof sql!=='string'||!sql.trim()||sql.includes('\0')||/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(sql))fail();
  let clean='';for(let i=0;i<sql.length;){const c=sql[i],n=sql[i+1];if(c==='-'&&n==='-'){clean+='  ';i+=2;while(i<sql.length&&sql[i]!=='\n'){clean+=' ';i++;}continue;}if(c==='/'&&n==='*'){clean+='  ';i+=2;let closed=false;while(i<sql.length){if(sql[i]==='*'&&sql[i+1]==='/'){clean+='  ';i+=2;closed=true;break;}clean+=sql[i]==='\n'?'\n':' ';i++;}if(!closed)fail();continue;}if(c==="'"||c==='"'||c==='`'||c==='['){const end=c==='['?']':c;clean+=' ';i++;let closed=false;while(i<sql.length){if(sql[i]===end){if(end!==']'&&sql[i+1]===end){clean+='  ';i+=2;continue;}clean+=' ';i++;closed=true;break;}clean+=sql[i]==='\n'?'\n':' ';i++;}if(!closed)fail();continue;}clean+=c;i++;}
  const parts=clean.split(';');if(parts.at(-1).trim()==='')parts.pop();if(parts.length!==1||!parts[0].trim())fail();
  const words=parts[0].match(/[A-Za-z_][A-Za-z0-9_]*/g)||[];if(!words.length||!['select','with'].includes(words[0].toLowerCase()))fail();
  const forbidden=new Set(['insert','update','delete','replace','create','drop','alter','attach','detach','vacuum','reindex','analyze','pragma','begin','commit','rollback','savepoint','release']);if(words.some(w=>forbidden.has(w.toLowerCase())))fail();
}

export async function d1Query(a,token,fetchImpl=fetch,apiBase=API){
  const bytes=await privateRegularFile(a['sql-file']);let sql;try{sql=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail();}validateReadOnlySql(sql);
  const path=`accounts/${enc(a['account-id'])}/d1/database/${enc(a['d1-id'])}/query`,body=JSON.stringify({sql,params:[]});
  const r=await timedFetch(fetchImpl,apiUrl(path,apiBase),{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body});if(r.status<200||r.status>=300)fail();
  const v=await responseJson(r),keys=Object.keys(v);if(v.success!==true||!Array.isArray(v.result)||keys.some(k=>!['success','result','errors','messages'].includes(k))||(Object.hasOwn(v,'errors')&&(!Array.isArray(v.errors)||v.errors.length))||(Object.hasOwn(v,'messages')&&!Array.isArray(v.messages)))fail();return v.result;
}

async function safeOutput(path) {
  const target = resolve(path); if (target.startsWith(repo + sep) || target === repo) fail();
  try { await lstat(target); fail(); } catch (e) { if (e instanceof EvidenceError || e?.code !== 'ENOENT') throw e; }
  const parent = await realpath(dirname(target)).catch(fail); if (parent.startsWith(repo + sep) || parent === repo) fail();
  let cursor=parse(parent).root; for(const part of parent.slice(cursor.length).split(sep).filter(Boolean)){cursor=join(cursor,part);const i=await lstat(cursor).catch(fail);if(i.isSymbolicLink() || (i.mode & 0o170000)===0o120000 || (i.fileAttributes & 0x400))fail();}
  return {target,parent};
}
function depth(v,l=0){if(l>12)fail();if(Array.isArray(v)){if(v.length>10000)fail();for(const x of v)depth(x,l+1);}else if(v&&typeof v==='object'){const k=Object.keys(v);if(k.length>256)fail();for(const x of k)depth(v[x],l+1);}}
function rejectDuplicateJsonKeys(text){let i=0;const ws=()=>{while(/\s/u.test(text[i]||''))i++;},str=()=>{const start=i++;for(;;){if(i>=text.length)fail();if(text[i]==='\\'){i+=2;continue;}if(text[i++]==='"')break;}try{return JSON.parse(text.slice(start,i));}catch{fail();}},value=()=>{ws();if(text[i]==='{'){i++;const seen=new Set;ws();if(text[i]==='}'){i++;return;}for(;;){ws();if(text[i]!=='"')fail();const key=str();if(seen.has(key))fail();seen.add(key);ws();if(text[i++]!==':')fail();value();ws();if(text[i]==='}'){i++;return;}if(text[i++]!==',')fail();}}else if(text[i]==='['){i++;ws();if(text[i]===']'){i++;return;}for(;;){value();ws();if(text[i]===']'){i++;return;}if(text[i++]!==',')fail();}}else if(text[i]==='"')str();else{const m=/^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(text.slice(i));if(!m)fail();i+=m[0].length;}};value();ws();if(i!==text.length)fail();}
async function timedFetch(fetchImpl,url,init={}){const c=new AbortController(),t=setTimeout(()=>c.abort(),TIMEOUT_MS);try{return await fetchImpl(url,{...init,redirect:'manual',signal:c.signal});}catch{fail();}finally{clearTimeout(t);}}
function apiUrl(path,apiBase){const url=new URL(path,apiBase+'/');if(apiBase===API&&(url.origin!=='https://api.cloudflare.com'||!url.pathname.startsWith('/client/v4/')))fail();return url;}
async function responseJson(r){const declared=r.headers.get('content-length');if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>MAX_BODY))fail();const b=new Uint8Array(await r.arrayBuffer());if(b.length>MAX_BODY)fail();let v;try{const text=new TextDecoder('utf-8',{fatal:true}).decode(b);rejectDuplicateJsonKeys(text);v=JSON.parse(text);}catch{fail();}depth(v);if(!v||typeof v!=='object'||Array.isArray(v))fail();return v;}
async function apiJson(path,token,fetchImpl,apiBase=API){
  const r=await timedFetch(fetchImpl,apiUrl(path,apiBase),{headers:{Authorization:`Bearer ${token}`}});if(r.status<200||r.status>=300)fail();const v=await responseJson(r);if(v.success!==true||!Object.hasOwn(v,'result'))fail();return v.result;
}
const enc=encodeURIComponent;
async function authenticationMatch(token,fetchImpl,apiBase){const r=await timedFetch(fetchImpl,apiUrl('user/tokens/verify',apiBase),{headers:{Authorization:`Bearer ${token}`}});if(r.status>=200&&r.status<300){const v=await responseJson(r);if(v.success!==true||!Object.hasOwn(v,'result'))fail();return v.result?.status==='active';}if(r.status!==401)fail();const denied=await responseJson(r);if(denied.success!==false||!Array.isArray(denied.errors))fail();const user=await apiJson('user',token,fetchImpl,apiBase);return !!user&&typeof user==='object'&&!Array.isArray(user)&&typeof user.id==='string'&&user.id.trim().length>0;}
export async function cloudflarePreflight(a,token,fetchImpl=fetch,apiBase=API){const am=await authenticationMatch(token,fetchImpl,apiBase),zone=await apiJson(`zones/${enc(a['zone-id'])}`,token,fetchImpl,apiBase),worker=await apiJson(`accounts/${enc(a['account-id'])}/workers/services/${enc(a.worker)}`,token,fetchImpl,apiBase),d1=await apiJson(`accounts/${enc(a['account-id'])}/d1/database/${enc(a['d1-id'])}`,token,fetchImpl,apiBase),r2=await apiJson(`accounts/${enc(a['account-id'])}/r2/buckets/${enc(a['r2-bucket'])}`,token,fetchImpl,apiBase),domains=await apiJson(`accounts/${enc(a['account-id'])}/workers/domains`,token,fetchImpl,apiBase);const zm=zone?.id===a['zone-id']&&zone?.account?.id===a['account-id'],wm=[worker?.id,worker?.default_environment?.script?.id,worker?.default_environment?.script?.name,worker?.name].some(identity=>identity===a.worker),dm=d1?.uuid===a['d1-id']&&d1?.name===a['d1-name'],rm=r2?.name===a['r2-bucket'],cm=Array.isArray(domains)&&domains.some(x=>x?.service===a.worker&&x?.hostname===CANONICAL&&x?.zone_id===a['zone-id']);return{account_match:am,zone_match:zm,worker_match:wm,d1_match:dm,r2_match:rm,canonical_domain_match:cm,resource_ids_match:zm&&dm};}
export async function publicAccess(a,token,fetchImpl=fetch,apiBase=API){const root=`accounts/${enc(a['account-id'])}/r2/buckets/${enc(a.bucket)}/domains/`,m=await apiJson(root+'managed',token,fetchImpl,apiBase),c=await apiJson(root+'custom',token,fetchImpl,apiBase);return{dev_url_disabled:m?.enabled===false,custom_domains_disabled:c&&Object.keys(c).length===1&&Array.isArray(c.domains)&&c.domains.length===0};}

function objectPath(key){if(typeof key!=='string'||key.length<1||key.length>1024||/[\\\u0000-\u001f\u007f]/u.test(key))fail();const parts=key.split('/');if(parts.some(x=>!x||x==='.'||x==='..'))fail();return parts.map(enc).join('/');}
function normalizedMime(v){if(typeof v!=='string')fail();return v.split(';',1)[0].trim().toLowerCase();}
function magicOk(m,b){if(m==='audio/mpeg')return (b[0]===0x49&&b[1]===0x44&&b[2]===0x33)||(b[0]===0xff&&(b[1]&0xe0)===0xe0);if(m==='audio/wav'||m==='audio/x-wav')return b.subarray(0,4).toString()==='82,73,70,70'&&b.subarray(8,12).toString()==='87,65,86,69';if(m==='audio/ogg')return b.subarray(0,4).toString()==='79,103,103,83';if(m==='audio/mp4'||m==='audio/x-m4a')return b.length>=12&&b[4]===0x66&&b[5]===0x74&&b[6]===0x79&&b[7]===0x70;return false;}
export async function r2ObjectMetadata(a,token,fetchImpl=fetch,apiBase=API){
  objectPath(a['object-key']);const path=`accounts/${enc(a['account-id'])}/r2/buckets/${enc(a.bucket)}/objects`;const url=apiUrl(path,apiBase);url.searchParams.set('prefix',a['object-key']);url.searchParams.set('per_page','10');
  const r=await timedFetch(fetchImpl,url,{method:'GET',headers:{Authorization:`Bearer ${token}`}});if(r.status<200||r.status>=300)fail();const v=await responseJson(r);
  if(setMismatch(v,['success','result','errors','messages','result_info'])||v.success!==true||!Array.isArray(v.result)||!Array.isArray(v.errors)||v.errors.length||!Array.isArray(v.messages)||v.messages.length)fail();
  const info=v.result_info;if(!info||typeof info!=='object'||Array.isArray(info)||setMismatch(info,['page','per_page','count','total_count','total_pages']))fail();
  if(info.page!==1||info.per_page!==10||info.count!==v.result.length||info.total_count!==v.result.length||info.total_pages!==1||v.result.length>10)fail();
  const exact=v.result.filter(x=>x&&typeof x==='object'&&!Array.isArray(x)&&x.key===a['object-key']);if(exact.length!==1)fail();const item=exact[0];
  const allowed=new Set(['key','size','uploaded','etag','http_metadata','custom_metadata']);if(Object.keys(item).some(k=>!allowed.has(k))||!Object.hasOwn(item,'size')||!Object.hasOwn(item,'http_metadata'))fail();
  if(!Number.isSafeInteger(item.size)||item.size<1||item.size>MAX_OBJECT||!item.http_metadata||typeof item.http_metadata!=='object'||Array.isArray(item.http_metadata))fail();
  const httpAllowed=new Set(['contentType','contentLanguage','contentDisposition','contentEncoding','cacheControl','cacheExpiry']);if(Object.keys(item.http_metadata).some(k=>!httpAllowed.has(k))||!Object.hasOwn(item.http_metadata,'contentType'))fail();
  const mime=normalizedMime(item.http_metadata.contentType);if(!['audio/mpeg','audio/wav','audio/x-wav','audio/ogg','audio/mp4','audio/x-m4a'].includes(mime))fail();return{content_type:mime,size:item.size};
}

function setMismatch(value,keys){return !value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k));}

const forbiddenHost = new RegExp(['ss','lip|qin','sheng\\.zoeg\\.studio|161-33-|185-80'].join(''), 'i');
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
function functionalAudioRequester(fetchImpl,origin,paceFn){let requested=false;return async(path,init={})=>{if(requested)try{await paceFn(FUNCTIONAL_AUDIO_PACE_MS);}catch{throw new EvidenceError('LIVE_EVIDENCE_ERROR','LIVE_AUDIO_PACING');}requested=true;return request(fetchImpl,origin,path,init);};}
async function verifyAudio(audioRequest,origin,item,checks){
  const u=new URL(item.listenUrl,origin),path=u.pathname+u.search;
  const get=await audioRequest(path),bytes=await bodyBytes(get),etag=get.headers.get('etag'),len=get.headers.get('content-length'),type=normalizedMime(get.headers.get('content-type'));
  checks.get&&=get.status===200&&Number(len)===bytes.length&&magicOk(type,bytes.subarray(0,16));
  const head=await audioRequest(path,{method:'HEAD'});checks.head&&=head.status===200&&(await bodyBytes(head)).length===0&&head.headers.get('content-length')===len&&head.headers.get('content-type')===get.headers.get('content-type');
  const range=await audioRequest(path,{headers:{Range:'bytes=0-1'}}),rb=await bodyBytes(range);checks.range&&=range.status===206&&rb.length===2&&range.headers.get('content-range')===`bytes 0-1/${bytes.length}`;
  checks.etag&&=typeof etag==='string'&&etag.length>2;const n304=await audioRequest(path,{headers:{'If-None-Match':etag||'invalid'}});checks.n304&&=n304.status===304&&(await bodyBytes(n304)).length===0;
  const n416=await audioRequest(path,{headers:{Range:`bytes=${bytes.length}-`}});checks.n416&&=n416.status===416&&n416.headers.get('content-range')===`bytes */${bytes.length}`;
}

async function waitForFreshAudioWindow(sleepFn){if(AUDIO_WINDOW_WAIT_MS>65_000)fail();try{await sleepFn(AUDIO_WINDOW_WAIT_MS);}catch{fail();}}
async function proveTerminalDefense(fetchImpl,origin,item){
  const u=new URL(item.listenUrl,origin),path=u.pathname+u.search;
  const valid=await request(fetchImpl,origin,path,{method:'HEAD'});if(valid.status!==200||(await bodyBytes(valid)).length!==0)fail();
  for(let count=2;count<=MAX_AUDIO_REQUESTS_PER_WINDOW+1;count++){
    const probe=await request(fetchImpl,origin,path,{method:'HEAD'});
    if(probe.status===403)return true;
    if(probe.status===429){const retry=probe.headers.get('retry-after');return /^\d+$/.test(retry||'')&&Number(retry)>=1&&Number(retry)<=60;}
    if(probe.status!==200||(await bodyBytes(probe)).length!==0)fail();
  }
  return false;
}

export async function collectLiveGate(a,{fetchImpl=fetch,origin=ORIGIN,browserCollector=collectBrowserEvidence,edgeLauncher=spawn,cdpTransport,sleepFn=ms=>new Promise(r=>setTimeout(r,ms)),paceFn=ms=>new Promise(r=>setTimeout(r,ms))}={}){
  let gate='LIVE_SETUP';try{
  if(a.domain!==CANONICAL||a['r2-custom-domains-proof']!==true)fail();const injected=origin!==ORIGIN;if(!injected)origin=ORIGIN;
  const result=Object.fromEntries(LIVE_BOOLEAN_GATES.map(x=>[x,false]));Object.assign(result,{public_owner_count:0,audio_owner_count:0,old_link_occurrences:0});
  gate='LIVE_NON_VOLUME';
  const home=await request(fetchImpl,origin,'/'),works=await request(fetchImpl,origin,'/works');const homeText=(await bodyBytes(home,MAX_BODY)).toString('utf8'),worksText=(await bodyBytes(works,MAX_BODY)).toString('utf8');
  result.homepage=home.status===200;result.works=works.status===200&&/href=["']\/works["']/.test(homeText);result.csp=!!home.headers.get('content-security-policy')&&!!works.headers.get('content-security-policy');result.security_headers=headersOk(home.headers)&&headersOk(works.headers);
  const first=await listing(fetchImpl,origin),items=first.items,ids=first.ids;result.owner_model=true;
  result.public_owner_count=ids.length;result.public_owners=true;result.audio_owner_count=items.length;
  const checks={get:true,head:true,range:true,etag:true,n304:true,n416:true,tamper:true,expiry:true};
  result.legacy_static_denied=(await Promise.all(['/media/submissions/probe.mp3','/media/probe.mp3','/guyun/media/probe.mp3'].map(p=>request(fetchImpl,origin,p)))).every(r=>[403,404].includes(r.status));
  const robots=await request(fetchImpl,origin,'/robots.txt'),robotText=(await bodyBytes(robots,MAX_BODY)).toString('utf8');result.robots=robots.status===200&&/Disallow:\s*\/api\//i.test(robotText);result.not_found_404=(await request(fetchImpl,origin,'/__live_evidence_fixed_404__')).status===404;
  const vote=await request(fetchImpl,origin,'/vote'),voteText=(await bodyBytes(vote,MAX_BODY)).toString('utf8');if(vote.status!==200||!/^\s*<!doctype html|<html[\s>]/i.test(voteText))fail();
  const protectedSpecs=[['GET','/register'],['GET','/admin'],['GET','/api/me/registration'],['POST','/api/registration'],['PUT','/api/registration/1'],['GET','/api/me/vote'],['PUT','/api/me/vote'],['POST','/auth/logout'],['GET','/api/admin/overview'],['GET','/api/admin/registrations'],['PUT','/api/admin/registrations/1'],['GET','/api/admin/votes'],['GET','/api/admin/audit'],['GET','/api/admin/export'],['GET','/api/admin/settings'],['PUT','/api/admin/settings'],['GET','/api/admin/schedule'],['PUT','/api/admin/schedule']];result.protected_routes_fail_closed=true;for(const [method,p]of protectedSpecs){const r=await request(fetchImpl,origin,p,{method});const text=(await bodyBytes(r,MAX_BODY)).toString('utf8');result.protected_routes_fail_closed&&=genericFailure(r,text);}
  const browser=await browserCollector({origin,allowInjectedOrigin:injected,edgeLauncher,cdpTransport}),pages=browser.pages;if(!Array.isArray(pages)||pages.length!==3||pages.some((p,i)=>p.path!==['/','/works','/vote'][i]||p.status!==200||!String(p.html).trim()))fail();
  const urls=pages.flatMap(p=>[...(p.urls||[]),...(p.resourceUrls||[])]),texts=pages.flatMap(p=>[p.html,...(p.redirectUrls||[]),...(p.failedUrls||[])]),all=[...urls,...texts];let old=0;for(const value of all){const s=String(value);old+=(s.match(new RegExp(forbiddenHost.source,'ig'))||[]).length;for(const match of s.matchAll(/https?:\/\/[^\s"'<>]+/ig))if(!sameOrigin(match[0],origin))old++;if(/challenges\.cloudflare\.com/i.test(s))old++;}old+=pages.reduce((n,p)=>n+(p.redirectUrls?.length||0)+(p.failedUrls?.length||0),0);result.old_link_occurrences=old;result.browser_network_inventory=urls.length>0&&old===0&&urls.every(x=>sameOrigin(x,origin));result.browser_dom_inventory=old===0&&pages.every(p=>String(p.html).length>0&&!/(?:href|src|action)=["'](?:https?:)?\/\//i.test(String(p.html).replaceAll(origin,'')));
  gate='LIVE_AUDIO_WINDOW_1';const firstAudioRequest=functionalAudioRequester(fetchImpl,origin,paceFn);for(const item of items.slice(0,10))await verifyAudio(firstAudioRequest,origin,item,checks);
  const firstUrl=new URL(items[0].listenUrl,origin),bad=new URL(firstUrl);bad.searchParams.set('token',(bad.searchParams.get('token')||'x')+'x');
  const expired=new URL(firstUrl);expired.searchParams.set('token','expired.0.invalid');checks.tamper=[401,403].includes((await firstAudioRequest(bad.pathname+bad.search)).status);checks.expiry=[401,403].includes((await firstAudioRequest(expired.pathname+expired.search)).status);
  gate='LIVE_AUDIO_WINDOW_WAIT_1';await waitForFreshAudioWindow(sleepFn);
  const fresh=await listing(fetchImpl,origin);if(fresh.ids.some((id,i)=>id!==ids[i]))fail();
  gate='LIVE_AUDIO_WINDOW_2';const secondAudioRequest=functionalAudioRequester(fetchImpl,origin,paceFn);for(const item of fresh.items.slice(10))await verifyAudio(secondAudioRequest,origin,item,checks);
  Object.assign(result,{audio_get:checks.get,audio_head:checks.head,audio_range:checks.range,audio_etag:checks.etag,audio_304:checks.n304,audio_416:checks.n416,tamper_denied:checks.tamper,expiry_denied:checks.expiry});
  if(Object.keys(result).length!==LIVE_BOOLEAN_GATES.length+LIVE_COUNT_GATES.length||LIVE_BOOLEAN_GATES.filter(k=>k!=='rate_limit').some(k=>result[k]!==true)||result.public_owner_count!==20||result.audio_owner_count!==20||result.old_link_occurrences!==0)fail();
  gate='LIVE_AUDIO_WINDOW_WAIT_2';await waitForFreshAudioWindow(sleepFn);gate='LIVE_DEFENSE';const terminal=await listing(fetchImpl,origin);if(terminal.ids.some((id,i)=>id!==ids[i]))fail();result.rate_limit=await proveTerminalDefense(fetchImpl,origin,terminal.items[0]);if(result.rate_limit!==true)fail();return result;
  }catch(e){throw new EvidenceError('LIVE_EVIDENCE_ERROR',LIVE_DIAGNOSTIC_GATES.includes(e?.gate)?e.gate:gate);}
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
export function parseDevToolsActivePort(value){if(typeof value!=='string')fail();const match=/^([1-9]\d{0,4})\r?\n(\/devtools\/browser\/[A-Za-z0-9._-]+)\r?\n?$/.exec(value);if(!match||Number(match[1])>65535)fail();return{port:match[1],browserPath:match[2]};}
export function validatePageWebSocketUrl(value,port){if(typeof value!=='string'||/[\r\n]/.test(value)||!/^([1-9]\d{0,4})$/.test(port)||Number(port)>65535)fail();let url;try{url=new URL(value);}catch{fail();}if(url.protocol!=='ws:'||url.hostname!=='127.0.0.1'||url.port!==port||url.username||url.password||url.search||url.hash||url.host!==`127.0.0.1:${port}`||!/^\/devtools\/page\/[A-Za-z0-9._-]+$/.test(url.pathname))fail();return url.href;}
async function waitForEdgeExit(edge){await new Promise(resolveWait=>{let timer,settled=false;const finish=()=>{if(settled)return;settled=true;if(timer!==undefined)clearTimeout(timer);try{edge.removeListener('exit',finish);}catch{}resolveWait();};try{if(edge.exitCode!=null||edge.signalCode!=null){finish();return;}timer=setTimeout(finish,1000);try{edge.once('exit',finish);}catch{finish();return;}if(edge.exitCode!=null||edge.signalCode!=null)finish();}catch{finish();}});}
export async function collectBrowserEvidence({origin,edgeLauncher=spawn,cdpTransport}){let edge,temp,session;try{let executable;for(const p of EDGE_PATHS){try{const i=await lstat(p);if(i.isFile()){executable=p;break;}}catch{}}if(!executable)fail();temp=await mkdtemp(join(tmpdir(),'live-edge-'));edge=edgeLauncher(executable,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${temp}`,'about:blank'],{shell:false,stdio:'ignore'});const deadline=Date.now()+TIMEOUT_MS;let active;while(Date.now()<deadline){try{active=parseDevToolsActivePort(await readFile(join(temp,'DevToolsActivePort'),'utf8'));break;}catch{await new Promise(r=>setTimeout(r,50));}}if(!active)fail();const list=await timedFetch(fetch,`http://127.0.0.1:${active.port}/json/new?${encodeURIComponent(origin)}`,{method:'PUT'});if(list.status!==200||!/^application\/json(?:\s*;|$)/i.test(list.headers.get('content-type')||''))fail();const body=await bodyBytes(list,MAX_BODY);let target;try{target=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));}catch{fail();}const webSocketUrl=validatePageWebSocketUrl(target?.webSocketDebuggerUrl,active.port);session=cdpTransport?await cdpTransport({webSocketUrl,origin}):await webSocketSession(webSocketUrl);return await collectCdpEvidence({origin,session});}catch{fail();}finally{try{await session?.close?.();}catch{}if(edge){try{edge.kill();}catch{}try{await waitForEdgeExit(edge);}catch{}}if(temp)try{await rm(temp,{recursive:true,force:true});}catch{}}}

async function runMode(a,token){if(a.mode==='cloudflare-preflight')return cloudflarePreflight(a,token);if(a.mode==='d1-query')return d1Query(a,token);if(a.mode==='r2-public-access')return publicAccess(a,token);if(a.mode==='r2-object-metadata')return r2ObjectMetadata(a,token);if(a.mode==='live-gate')return collectLiveGate(a);fail();}
async function atomicWrite(path,envelope){const{target,parent}=await safeOutput(path),temp=join(parent,`.live-evidence-${randomBytes(16).toString('hex')}`);let h;try{h=await open(temp,'wx',0o600);await h.writeFile(JSON.stringify(envelope));await h.sync();await h.close();h=undefined;await chmod(temp,0o600).catch(()=>{});await rename(temp,target);const d=await open(parent,'r').catch(()=>null);if(d){await d.sync().catch(()=>{});await d.close();}}catch(e){if(h)await h.close().catch(()=>{});await unlink(temp).catch(()=>{});throw e;}}
export function parseLiveDiagnostic(value){return value&&Object.keys(value).length===1&&LIVE_DIAGNOSTIC_GATES.includes(value.gate)?value.gate:null;}
export async function writeLiveDiagnostic(path,value){const gate=parseLiveDiagnostic(value);if(!gate)fail();await atomicWrite(path,{gate});}
export async function main(argv=process.argv.slice(2)){const a=parseArgs(argv),token=process.env.CLOUDFLARE_API_TOKEN;if(typeof token!=='string'||!token)fail();await safeOutput(a.output);try{const result=await runMode(a,token);await atomicWrite(a.output,{nonce:a.nonce,result});}catch(e){if(a.mode==='live-gate'&&parseLiveDiagnostic({gate:e?.gate}))await writeLiveDiagnostic(`${a.output}.gate.json`,{gate:e.gate});throw e;}}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{process.stderr.write('LIVE_EVIDENCE_ERROR\n');process.exitCode=1;});
