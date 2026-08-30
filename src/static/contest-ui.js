(()=>{
  const out=(el,msg)=>{if(el)el.textContent=msg};
  const error=async r=>{try{return (await r.json()).error||`http_${r.status}`}catch{return `http_${r.status}`}};
  async function registration(){
    const form=document.querySelector('[data-registration]'); if(!form)return;
    const r=await fetch('/api/me/registration');
    if(r.status===401){document.querySelector('#auth-state').innerHTML='<a href="/auth/discord/start?next=/register">使用 Discord 登入並驗證資格</a>';return;}
    if(!r.ok){out(form.querySelector('output'),`無法載入：${await error(r)}`);return;}
    const me=await r.json(); out(document.querySelector('#auth-state'),me.eligible?'Discord 資格已驗證':'目前帳號不具參賽資格');
    if(me.registration)for(const [k,v] of Object.entries({title:me.registration.title,category:me.registration.category,description:me.registration.description,contactEmail:me.registration.contactEmail}))if(form.elements[k])form.elements[k].value=v||'';
    form.addEventListener('submit',async e=>{e.preventDefault();const data=new FormData(form);data.set('turnstileToken',data.get('cf-turnstile-response')||'');const target=me.registration?`/api/registration/${encodeURIComponent(me.registration.id)}`:'/api/registration';const x=await fetch(target,{method:me.registration?'PUT':'POST',headers:{'x-csrf-token':me.csrfToken},body:data});out(form.querySelector('output'),x.ok?'登記已安全儲存':`無法儲存：${await error(x)}`);});
  }
  async function voting(){const root=document.querySelector('[data-vote]');if(!root)return;const p=await fetch('/api/public/voting');if(!p.ok){out(root,`無法載入投票：${await error(p)}`);return;}const data=await p.json();root.replaceChildren();const note=document.createElement('p');note.textContent=data.stage?`${data.stage.title}：${data.stage.status}`:'目前沒有投票階段';root.append(note);}
  registration();voting();
})();
