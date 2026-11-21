// Auditoría de navegación con control remoto: ¿se puede llegar con flechas a cada control y activarlo con OK?
const {chromium}=require('playwright');const {install,B}=require('./mocks');
const UA='Mozilla/5.0 (Linux; Android 9; AFTKA Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36';
async function bfs(p,label){
  const r=await p.evaluate(()=>{
    const root=document.querySelector('.modal-bg:last-of-type')||(document.querySelector('#player.open')||document);
    const sel='button:not([tabindex="-1"]), a[href], input:not([type=hidden]):not([type=file]), select, textarea';
    const vis=el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(el).visibility!=='hidden'&&!el.disabled&&!el.closest('[hidden]');};
    let all=[...root.querySelectorAll(sel)].filter(vis);
    if(root===document) all=all.filter(e=>!e.closest('#player'));
    const key=el=>{const i=all.indexOf(el);return i;};
    const start=document.activeElement&&all.includes(document.activeElement)?document.activeElement:(all.find(e=>e.matches('.card'))||all[0]);
    const seen=new Set([start]);const q=[start];
    const press=k=>document.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}));
    let guard=0;
    while(q.length&&guard++<4000){const e=q.shift();for(const k of ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight']){e.focus({preventScroll:true});e.scrollIntoView({block:'nearest',inline:'nearest'});press(k);const a=document.activeElement;if(a&&all.includes(a)&&!seen.has(a)){seen.add(a);q.push(a);}}}
    const miss=all.filter(e=>!seen.has(e)).map(e=>(e.tagName.toLowerCase()+(e.type&&e.tagName==='INPUT'?'['+e.type+']':'')+' "'+(e.textContent||e.placeholder||e.value||e.id||'').trim().slice(0,30)+'"'+(e.id?'#'+e.id:'')));
    return {total:all.length,reached:seen.size,miss};
  });
  console.log((r.miss.length?'❌':'✅')+` ${label}: ${r.reached}/${r.total} alcanzables`+(r.miss.length?' · NO se llega a: '+r.miss.slice(0,12).join(', '):''));
  return r;
}
(async()=>{
const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
const p=await (await b.newContext({viewport:{width:960,height:540},userAgent:UA})).newPage();
const errs=[];p.on('pageerror',e=>errs.push(e.message));await install(p);
await p.goto(B+'MiTV.html#no-resume');await p.waitForTimeout(2500);
const go=async(tab)=>{await p.evaluate(t=>{document.querySelector(`#tabs [data-tab=${t}]`).focus();},tab);await p.keyboard.press('Enter');await p.waitForTimeout(1800);};
for(const t of ['inicio','plus','vivo','deportes','peliculas','radio','multi','favoritos','ajustes']){await go(t);await bfs(p,'Pestaña '+t);}
await go('deportes');await p.click('[data-s=agenda]');await p.waitForTimeout(1500);await bfs(p,'Agenda deportiva');
await go('radio');await p.mouse.move(600,300);await p.click('[data-r=pod]');await p.waitForTimeout(500);await bfs(p,'Podcasts');
await p.click('[data-r=fav]');await p.waitForTimeout(500);await bfs(p,'Mis radios');
await p.evaluate(()=>document.querySelector('#profBtn').focus());await p.keyboard.press('Enter');await p.waitForTimeout(500);await bfs(p,'Modal de perfiles');await p.keyboard.press('Escape');
await go('vivo');await p.evaluate(()=>document.querySelector('#g .card').focus());await p.keyboard.press('Enter');await p.waitForTimeout(2500);
await p.keyboard.press('Enter');await p.waitForTimeout(200);await bfs(p,'Reproductor (barra de botones)');
await p.evaluate(()=>document.querySelector('#pMore').focus());await p.keyboard.press('Enter');await p.waitForTimeout(300);await bfs(p,'Reproductor: menú Más');
await p.keyboard.press('Escape');await p.keyboard.press('Escape');await p.waitForTimeout(400);
// Activación con OK: casillas, selectores, salir de campos de texto
await go('ajustes');
const cb=await p.evaluate(()=>{const c=document.querySelector('#big');c.focus();const before=c.checked;document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));return [before,c.checked];});
console.log((cb[0]!==cb[1]?'✅':'❌')+' OK activa una casilla (Letra grande): '+cb.join('→'));
const esc=await p.evaluate(()=>{const i=document.querySelector('#q');i.focus();for(const k of ['ArrowLeft','ArrowRight','ArrowDown']){i.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}));if(document.activeElement!==i)return k;}return null;});
console.log((esc?'✅':'❌')+' Salir del buscador con flechas'+(esc?' ('+esc+')':' (queda atrapado)'));
const sel=await p.evaluate(()=>{const s=document.querySelector('#qual');s.focus();s.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));return document.activeElement!==s;});
console.log((sel?'✅':'❌')+' Salir de una lista desplegable con flechas');
const pick=await p.evaluate(async()=>{const s=document.querySelector('#qual');s.focus();const before=s.value;s.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,100));const opts=[...document.querySelectorAll('.pickopt')];const target=opts.find(o=>!o.textContent.startsWith('✓'));const focusOk=document.activeElement&&document.activeElement.classList.contains('pickopt');target.click();await new Promise(r=>setTimeout(r,100));return {n:opts.length,focusOk,before,after:s.value,back:document.activeElement===s,saved:JSON.parse(localStorage['mitv:cfg']).quality};});
console.log((pick.n===3&&pick.focusOk&&pick.before!==pick.after&&pick.saved===pick.after&&pick.back?'✅':'❌')+' OK en lista desplegable abre lista grande y guarda: '+JSON.stringify(pick));
const edge=await p.evaluate(()=>{const i=document.querySelector('#lName');i.focus();i.value='abc';i.setSelectionRange(1,1);const press=k=>i.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}));press('ArrowLeft');const stayed=document.activeElement===i;i.setSelectionRange(3,3);press('ArrowRight');return {stayed,left:document.activeElement!==i};});
console.log((edge.stayed&&edge.left?'✅':'❌')+' Campo de texto: ◀▶ mueven el cursor y en el borde salen del campo '+JSON.stringify(edge));
const vis=await p.evaluate(()=>{const c=document.querySelector('#big');c.focus();const st=getComputedStyle(c.closest('label'));return st.outlineStyle+' '+st.outlineWidth;});
console.log((vis.startsWith('solid')?'✅':'❌')+' Foco visible en casillas: '+vis);
console.log('Errores JS:',errs.length?errs:'ninguno');await b.close();})();
