const te = new TextEncoder();
export const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
export const unb64u = s => Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')+'==='.slice((s.length+3)%4)),c=>c.charCodeAt(0));
export async function sha256(v){ return b64u(await crypto.subtle.digest('SHA-256', typeof v==='string'?te.encode(v):v)); }
export function randomToken(n=32){const b=new Uint8Array(n);crypto.getRandomValues(b);return b64u(b);}
export function timingSafe(a,b){if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;}
export async function hmac(secret,value){const k=await crypto.subtle.importKey('raw',te.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64u(await crypto.subtle.sign('HMAC',k,te.encode(value)));}
export async function capability(secret,id,ttl=300){const exp=Math.floor(Date.now()/1000)+ttl,nonce=randomToken(12),body=`${id}.${exp}.${nonce}`;return `${body}.${await hmac(secret,body)}`;}
export async function verifyCapability(secret,id,token){const p=(token||'').split('.');if(p.length!==4||p[0]!==id||!/^\d+$/.test(p[1])||+p[1]<Date.now()/1000)return false;return timingSafe(await hmac(secret,p.slice(0,3).join('.')),p[3]);}
export function clientIp(r){return r.headers.get('CF-Connecting-IP')||'unknown';}
export function cookie(r,name){for(const x of (r.headers.get('Cookie')||'').split(';')){const [k,...v]=x.trim().split('=');if(k===name)return decodeURIComponent(v.join('='));}return null;}
export function originOkay(r,canonical){const o=r.headers.get('Origin');return !!o&&o===canonical;}
export async function verifyAccessJwt(request,env){
  const raw=request.headers.get('Cf-Access-Jwt-Assertion'); if(!raw||!env.ACCESS_AUD||!env.ACCESS_TEAM_DOMAIN||!env.ACCESS_JWKS) return null;
  const p=raw.split('.');if(p.length!==3)return null;let h,c,j;try{h=JSON.parse(new TextDecoder().decode(unb64u(p[0])));c=JSON.parse(new TextDecoder().decode(unb64u(p[1])));j=JSON.parse(env.ACCESS_JWKS);}catch{return null;}
  const key=j.keys?.find(x=>x.kid===h.kid&&x.kty==='RSA');if(!key||h.alg!=='RS256'||c.aud!==env.ACCESS_AUD&&!(Array.isArray(c.aud)&&c.aud.includes(env.ACCESS_AUD))||c.exp<=Date.now()/1000||c.iss!==`https://${env.ACCESS_TEAM_DOMAIN}`)return null;
  try{const k=await crypto.subtle.importKey('jwk',key,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);return await crypto.subtle.verify('RSASSA-PKCS1-v1_5',k,unb64u(p[2]),te.encode(`${p[0]}.${p[1]}`))?c:null;}catch{return null;}
}
export async function verifyTurnstile(request,env,token){if(!env.TURNSTILE_SECRET)return false;const f=new FormData();f.set('secret',env.TURNSTILE_SECRET);f.set('response',token||'');f.set('remoteip',clientIp(request));try{const x=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:f});return !!(await x.json()).success;}catch{return false;}}
export function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8',...headers}});}
