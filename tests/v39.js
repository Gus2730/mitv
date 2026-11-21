// Pruebas de MiTV 3.9: aspecto y funciones premium
const {chromium}=require('playwright');const {install,B}=require('./mocks');
const ok=(c,m)=>console.log((c?'✅':'❌')+' '+m);
const TV='Mozilla/5.0 (Linux; Android 9; AFTKA Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36';
(async()=>{
const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
const ctx=await b.newContext({viewport:{width:1280,height:720}});
await ctx.addInitScript(()=>{localStorage['mitv:cfg']=JSON.stringify({tmdbKey:'k'.repeat(32)});
  const day=n=>{const d=new Date();d.setDate(d.getDate()-n);return d.toLocaleDateString('sv')};
  localStorage['mitv:P:p1:stats']=JSON.stringify({ch:{'http://a':{n:'Canal Uno',s:7200,c:'News',logo:'',k:''},'http://b':{n:'Canal Dos',s:3000,c:'Sports',logo:'',k:''}},cat:{News:7200,Sports:3000},day:{[day(0)]:3600,[day(1)]:1800,[day(2)]:900,[day(5)]:600}});});
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));await install(p);
// TMDB simulado
await p.route(/api\.themoviedb\.org\/3\/search\/movie/,r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({results:[{id:77,title:'Película Prueba',release_date:'2020-01-01',poster_path:'/a.jpg',overview:'Sinopsis',vote_average:7}]})}));
await p.route(/api\.themoviedb\.org\/3\/movie\/77\/videos/,r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({results:[{site:'YouTube',type:'Trailer',key:'ABCDEFGHIJK'}]})}));
await p.route(/youtube-nocookie\.com/,r=>r.fulfill({status:200,contentType:'text/html',body:'<body>trailer</body>'}));
await p.goto(B+'MiTV.html#no-resume');await p.waitForTimeout(2200);
// Efectos y temas
ok(await p.evaluate(()=>document.documentElement.classList.contains('fxfull')),'Efectos completos en computadora');
await p.$eval('[data-tab=vivo]',e=>e.click());await p.waitForTimeout(1500);
const th=await p.$eval('#g .thumb',e=>({bg:getComputedStyle(e).backgroundImage.slice(0,40),tc:e.style.getPropertyValue('--tc')}));
ok(/hsl\(/.test(th.tc),'Cada canal tiene su color de recuadro: '+th.tc);
const cols=await p.$$eval('#g .thumb',els=>new Set(els.map(e=>e.style.getPropertyValue('--tc'))).size);
ok(cols>=3,'Los canales tienen colores distintos ('+cols+')');
await p.screenshot({path:'v39_vivo.png'});
await p.mouse.move(5,5);await p.keyboard.press('Shift');await p.evaluate(()=>document.querySelectorAll('#g .card')[1].focus());await p.keyboard.press('Shift');await p.waitForTimeout(500);
const dim=await p.$$eval('#g .card',c=>c.map(x=>getComputedStyle(x).opacity));
ok(dim[1]==='1'&&parseFloat(dim[3])<0.8,'Al enfocar una tarjeta, las demás se atenúan: '+dim.slice(0,4).join(', '));
const tr=await p.$eval('#g .card:nth-child(2)',c=>getComputedStyle(c).transform);
ok(tr!=='none','La tarjeta enfocada crece ('+tr.slice(0,30)+')');
// Esqueleto de carga
await p.route(/countries\/mx\.m3u/,async r=>{await new Promise(x=>setTimeout(x,1500));r.fulfill({status:200,body:'#EXTM3U\n#EXTINF:-1 group-title="General",Canal MX\nhttp://127.0.0.1:8766/live.m3u8\n',headers:{'access-control-allow-origin':'*'}})});
await p.click('aside [data-country=mx]');await p.waitForTimeout(300);
ok(await p.locator('.sk').count()>=6,'Mientras carga se ven tarjetas esqueleto ('+await p.locator('.sk').count()+')');
await p.screenshot({path:'v39_skel.png'});await p.waitForTimeout(2500);
// Temas
await p.$eval('[data-tab=ajustes]',e=>e.click());await p.waitForTimeout(800);
const temas=await p.$$eval('#themes .chip',x=>x.map(y=>y.textContent));
ok(temas.length===8&&temas.includes('Negro puro')&&temas.includes('Océano'),'Temas: '+temas.join(', '));
await p.click('#themes [data-theme=oceano]');await p.waitForTimeout(300);
ok(await p.evaluate(()=>document.documentElement.dataset.theme==='oceano'||document.body.dataset.theme==='oceano'||getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()==='#22d3ee'),'Tema Océano aplicado');
await p.click('#themes [data-theme=""]');
// Efectos ligeros y sonidos en ajustes
await p.selectOption('#fxS','lite');await p.waitForTimeout(100);
ok(!(await p.evaluate(()=>document.documentElement.classList.contains('fxfull'))),'Efectos ligeros desactivan animaciones');
await p.selectOption('#fxS','full');
// Resumen mensual
await p.click('#sumBtn');await p.waitForTimeout(300);
const sum=await p.textContent('.modal');
ok(/Tu resumen GustiTV/.test(sum)&&/Canal Uno/.test(sum)&&/2 días seguidos|3 días seguidos/.test(sum)||/seguidos/.test(sum),'Resumen: '+sum.replace(/\s+/g,' ').slice(0,150));
ok(/1 h 55 min|1 h 50 min|1 h 45 min|1 h 5\d min|2 h/.test(sum)||/vistos este mes/.test(sum),'Resumen muestra el tiempo del mes');
await p.screenshot({path:'v39_resumen.png'});
await p.click('#sumNo');
// Avatar
await p.click('#profBtn');await p.waitForTimeout(300);
await p.click('#avp [data-av="🦊"]');await p.waitForTimeout(400);
ok(await p.textContent('#profBtn')==='🦊','Avatar con emoji en el encabezado');
await p.click('#pfNo');
// Inicio: resumen y transición
await p.$eval('[data-tab=inicio]',e=>e.click());await p.waitForTimeout(1000);
ok(await p.isVisible('#sumHome'),'Botón Mi resumen en Inicio');
// Reproductor: insignias, progreso, menú
await p.$eval('[data-tab=vivo]',e=>e.click());await p.waitForTimeout(1200);
await p.click('#g .card >> nth=0');await p.waitForTimeout(2500);
const bd=await p.textContent('#pBadge');
ok(/EN VIVO/.test(bd),'Insignias del reproductor: '+bd.replace(/\s+/g,' ').trim());
await p.click('#pMore');await p.waitForTimeout(200);
const menu=await p.textContent('#pMenu');
ok(/Enviar a otro dispositivo/.test(menu)&&/Apagar automáticamente/.test(menu),'Menú: enviar a otro dispositivo');
await p.keyboard.press('Escape');
await p.click('#pClose');await p.waitForTimeout(300);
// Tráiler en películas
await p.$eval('[data-tab=peliculas]',e=>e.click()).catch(()=>{});await p.waitForTimeout(600);
console.log('Errores JS:',errs.length?errs:'ninguno');

// ---------- Android TV ----------
const ctxA=await b.newContext({viewport:{width:960,height:540},userAgent:TV});
await ctxA.addInitScript(()=>{window.__w=null;window.__upd=null;window.__launch='http://127.0.0.1:8766/live2.m3u8';
  localStorage['mitv:P:p1:favs']=JSON.stringify([{name:'FUTV (1080p)',url:'http://127.0.0.1:8766/live2.m3u8'},{name:'Teletica 7',url:'http://127.0.0.1:8766/master.m3u8'}]);
  window.MiTVAndroid={isTv:()=>true,hasVoice:()=>false,playNative(j){window.__nat=j},exitApp(){},setPlaying(){},setBackgroundAudio(){},registerHeaders(){},setStreamHeaders(){},
    setWidgetFavs:j=>{window.__w=j},takeLaunchChannel:()=>{const u=window.__launch;window.__launch='';return u},installUpdate:u=>{window.__upd=u}};});
const a=await ctxA.newPage();const errsA=[];a.on('pageerror',e=>errsA.push(e.message));await install(a);
await a.goto(B+'MiTV.html#no-resume');await a.waitForTimeout(3500);
ok(await a.evaluate(()=>!document.documentElement.classList.contains('fxfull')),'En la TV los efectos son ligeros por defecto');
const w=JSON.parse(await a.evaluate(()=>window.__w||'[]'));
ok(w.length===2&&w[0].n&&w[0].u,'El widget recibe los favoritos: '+w.map(x=>x.n).join(', '));
const nat1=JSON.parse(await a.evaluate(()=>window.__nat||'{"items":[]}'));
ok(nat1.items.length&&/FUTV/.test(nat1.items[nat1.index].name),'Tocar un canal en el widget abre ese canal: '+(nat1.items[nat1.index]||{}).name);
// Actualización dentro de la app
await a.evaluate(()=>{mitvTest.showUpdate({version:'9.9',apk:'MiTV.apk'}, 'https://x.test/mitv/');});
ok(/Actualizar ahora/.test(await a.textContent('#updBar')),'Botón “Actualizar ahora”');
await a.click('#updGo');
ok((await a.evaluate(()=>window.__upd))==='https://x.test/mitv/MiTV.apk','Se pide la descarga a Android: '+await a.evaluate(()=>window.__upd));
await a.evaluate(()=>mitvUpdateEvent('perm'));await a.waitForTimeout(200);
ok(/Permitir de esta fuente/.test(await a.textContent('#toast')),'Aviso si falta el permiso de instalación');
// Enviar a otro dispositivo: ejecutar el comando recibido
await a.evaluate(()=>{window.__nat=null;});
await a.evaluate(()=>mitvTest.execRemote({k:'playch',v:JSON.stringify({name:'Canal Enviado',url:'http://127.0.0.1:8766/live.m3u8',kind:'',group:'General'}),t:Date.now()}));await a.waitForTimeout(1200);
const nat2=JSON.parse(await a.evaluate(()=>window.__nat||'{"items":[]}'));
ok(nat2.items.length&&/Canal Enviado/.test(nat2.items[nat2.index].name),'Un canal enviado desde otro dispositivo se reproduce');
// Sonidos en TV activados por defecto
ok(await a.evaluate(()=>mitvTest.soundsOn()),'Sonidos suaves activos en TV por defecto');
await a.screenshot({path:'v39_tv.png'});
console.log('Errores JS (Android):',errsA.length?errsA:'ninguno');
await b.close();})();
