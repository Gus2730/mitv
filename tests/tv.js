const {chromium}=require('playwright');const {install,B}=require('./mocks');
const ok=(c,m)=>console.log((c?'✅':'❌')+' '+m);
(async()=>{
const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
const ctx=await b.newContext({viewport:{width:960,height:540},userAgent:'Mozilla/5.0 (Linux; Android 9; AFTKA Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36'});
const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); await install(p);
// lista grande para probar "Mostrar más"
let big='#EXTM3U\n'; for(let i=1;i<=300;i++) big+=`#EXTINF:-1 group-title="General",Canal Prueba ${i}\n${B}live.m3u8\n`;
await p.route(/countries\/mx\.m3u/,r=>r.fulfill({status:200,body:big,headers:{'access-control-allow-origin':'*'}}));
let maxConc=0,cur=0; p.on('request',r=>{if(r.url().includes('live.m3u8')||r.url().includes('master.m3u8')||r.url().includes('nada.m3u8')){cur++;maxConc=Math.max(maxConc,cur);}}); p.on('requestfinished',r=>{if(/m3u8/.test(r.url()))cur=Math.max(0,cur-1)}); p.on('requestfailed',r=>{if(/m3u8/.test(r.url()))cur=Math.max(0,cur-1)});
await p.goto(B+'MiTV.html#no-resume'); await p.waitForTimeout(1500);
ok(await p.evaluate(()=>document.documentElement.classList.contains('tv')),'Modo TV activado en Fire TV');
ok(await p.evaluate(()=>!document.querySelector('#video').hasAttribute('controls')),'Sin controles nativos del navegador');
ok(await p.evaluate(()=>!JSON.parse(localStorage['mitv:cfg']).preview),'Vista previa apagada');
ok(await p.evaluate(()=>document.activeElement && document.activeElement!==document.body),'Al abrir ya hay algo enfocado: '+await p.evaluate(()=>document.activeElement.className||document.activeElement.textContent.slice(0,20)));
// ir a En vivo con el control
await p.evaluate(()=>document.querySelector('#tabs [data-tab=vivo]').focus()); await p.keyboard.press('Enter'); await p.waitForTimeout(1200);
ok(await p.evaluate(()=>document.activeElement.dataset.tab==='vivo'),'Foco se queda en la pestaña al cambiar');
await p.keyboard.press('ArrowDown'); await p.waitForTimeout(150);
const f1=await p.evaluate(()=>({c:document.activeElement.className,t:document.activeElement.textContent.trim().slice(0,25)})); ok(true,'↓ desde pestañas → '+JSON.stringify(f1));
// bajar varias veces en la cuadrícula: el foco nunca queda escondido bajo el encabezado
for(let i=0;i<6;i++){ await p.keyboard.press('ArrowRight'); await p.waitForTimeout(60);} 
for(let i=0;i<4;i++){ await p.keyboard.press('ArrowDown'); await p.waitForTimeout(60);} 
for(let i=0;i<4;i++){ await p.keyboard.press('ArrowUp'); await p.waitForTimeout(60);} 
const vis=await p.evaluate(()=>{const r=document.activeElement.getBoundingClientRect();const hr=document.querySelector('header').getBoundingClientRect();const side=document.documentElement.classList.contains('sidenav');return {top:r.top,left:r.left,bottom:r.bottom,h:side?0:hr.bottom,hl:side?hr.right:0,vh:innerHeight,el:document.activeElement.className||document.activeElement.textContent.slice(0,15),inHeader:document.querySelector('header').contains(document.activeElement)}});
ok((vis.inHeader || (vis.top>=vis.h-2 && vis.left>=vis.hl-2)) && vis.bottom<=vis.vh+2,'Elemento enfocado visible (no bajo el encabezado): '+JSON.stringify(vis));
// abrir canal con OK
await p.evaluate(()=>document.querySelector('#g .card').focus()); await p.keyboard.press('Enter'); await p.waitForTimeout(2000);
ok(await p.evaluate(()=>document.activeElement.id==='video'),'Al abrir canal el foco va al video');
const t1=await p.textContent('#pTitle'); await p.keyboard.press('ArrowDown'); await p.waitForTimeout(1500); const t2=await p.textContent('#pTitle');
ok(t1!==t2,'▼ cambia de canal: '+t1+' → '+t2);
await p.keyboard.press('Enter'); await p.waitForTimeout(200); ok(await p.evaluate(()=>document.activeElement.classList.contains('chl-item')),'OK abre la lista de canales');
await p.keyboard.press('Escape'); await p.waitForTimeout(150); ok(await p.evaluate(()=>document.activeElement.id==='video'),'Atrás cierra la lista y vuelve al video');
await p.keyboard.press('Escape'); await p.waitForTimeout(600);
ok(!(await p.isVisible('#player')) && await p.evaluate(()=>document.activeElement.classList.contains('card')),'Atrás cierra y vuelve a la tarjeta');
// cambiar país desde el menú lateral sin perder el foco
await p.evaluate(()=>document.querySelector('aside [data-country=mx]').focus()); await p.keyboard.press('Enter'); await p.waitForTimeout(1500);
ok(await p.evaluate(()=>document.activeElement.dataset.country==='mx'),'Foco se queda en el país elegido');
ok(await p.locator('#g .card').count()===120,'Solo 120 tarjetas a la vez en TV');
ok(await p.isVisible('[data-act=more]'),'Botón Mostrar más');
await p.click('[data-act=more]'); await p.waitForTimeout(500); ok(await p.locator('#g .card').count()===240,'Mostrar más agrega 120');
// velocidad de navegación
const ms=await p.evaluate(()=>{const c=document.querySelectorAll('#g .card');c[50].focus();const t=performance.now();for(let i=0;i<20;i++){document.dispatchEvent(new KeyboardEvent('keydown',{key:i%2?'ArrowDown':'ArrowUp',bubbles:true}));}return (performance.now()-t)/20;});
ok(ms<25,'Tiempo por flechazo con 240 tarjetas: '+ms.toFixed(1)+' ms');
await p.waitForTimeout(8000);
ok(maxConc<=3,'Revisión de canales liviana: máximo '+maxConc+' conexiones simultáneas');
await p.screenshot({path:'tv.png'});
const hdr=await p.evaluate(()=>{document.querySelector('#g .card').focus();scrollTo(0,3000);return new Promise(r=>setTimeout(()=>{const h=document.querySelector('header').getBoundingClientRect();r({top:h.top,w:h.width,side:document.documentElement.classList.contains('sidenav')})},100))});
ok(hdr.top===0,'Menú sigue visible al bajar: '+JSON.stringify(hdr));
ok(hdr.side && hdr.w<=90,'Menú lateral angosto mientras navegas el contenido ('+hdr.w+' px)');
await p.evaluate(()=>{scrollTo(0,0);document.querySelector('#g .card').focus();});for(let i=0;i<6;i++){if(await p.evaluate(()=>document.querySelector('header').contains(document.activeElement)))break;await p.keyboard.press('ArrowLeft');await p.waitForTimeout(80);}
const exp=await p.evaluate(()=>document.querySelector('header').contains(document.activeElement)?document.querySelector('header').getBoundingClientRect().width:-1);
ok(exp>=200,'Menú lateral se despliega con nombres al entrar con ◀ ('+exp+' px)');
await p.screenshot({path:'tv2.png'});
console.log('Errores JS:',errs.length?errs:'ninguno'); await b.close();})();
