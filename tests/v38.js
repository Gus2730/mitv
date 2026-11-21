// Pruebas de MiTV 3.8: navegación y experiencia de uso
const {chromium}=require('playwright');const {install,B}=require('./mocks');
const ok=(c,m)=>console.log((c?'✅':'❌')+' '+m);
const TV='Mozilla/5.0 (Linux; Android 9; AFTKA Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36';
(async()=>{
const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
// ---------- Computadora ----------
const p=await (await b.newContext({viewport:{width:1280,height:720}})).newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));await install(p);
await p.goto(B+'MiTV.html#no-resume');await p.waitForTimeout(2000);
ok(!(await p.isVisible('.modal')),'La guía de primer uso no estorba las pruebas automáticas');
// Sugerencias del buscador
await p.$eval('[data-tab=vivo]',e=>e.click());await p.waitForTimeout(1500);
await p.fill('#q','tele');await p.waitForTimeout(150);
ok(await p.isVisible('#qSug')&&/Teletica/.test(await p.textContent('#qSug')),'Sugerencias al escribir: '+(await p.textContent('#qSug')).replace(/\s+/g,' ').trim().slice(0,50));
await p.fill('#q','deportes caido');await p.waitForTimeout(150);
ok(/Deportes Caído/.test(await p.textContent('#qSug')),'Busca sin importar tildes');
await p.click('#qSug .sug');await p.waitForTimeout(800);
ok(await p.isVisible('#player')&&/Deportes Caído/.test(await p.textContent('#pTitle')),'Elegir una sugerencia abre el canal');
await p.click('#pClose');await p.fill('#q','');await p.keyboard.press('Enter');await p.waitForTimeout(800);
// Lista de canales con categorías, favoritos y vista previa
await p.click('#g .card >> nth=0');await p.waitForTimeout(1500);
await p.click('#pChl');await p.waitForTimeout(300);
const cats=await p.$$eval('.chl-cats .chip',c=>c.map(x=>x.textContent));
ok(cats.includes('Todos')&&cats.includes('★ Favoritos')&&cats.includes('Deportes'),'Categorías en la lista: '+cats.join(', '));
ok(await p.isVisible('#chlPrev')&&/Teletica/.test(await p.textContent('#chlPrev')),'Vista previa del canal: '+(await p.textContent('#chlPrev')).replace(/\s+/g,' ').trim().slice(0,60));
await p.click('.chl-cats .chip >> text=Deportes');await p.waitForTimeout(200);
const sp=await p.$$eval('.chl-item b',x=>x.map(y=>y.textContent));
ok(sp.length===2&&sp.every(n=>/Deportes|FUTV/.test(n)),'Filtrar por Deportes: '+sp.join(', '));
await p.click('.chl-fav[data-f="4"]');await p.waitForTimeout(200);
ok(await p.evaluate(()=>JSON.parse(localStorage['mitv:P:p1:favs']).some(f=>/FUTV/.test(f.name))),'☆ en la lista agrega a favoritos sin salir del video');
await p.click('.chl-cats .chip >> text=★ Favoritos');await p.waitForTimeout(200);
ok((await p.$$eval('.chl-item b',x=>x.map(y=>y.textContent))).join()==='FUTV (1080p)','Categoría ★ Favoritos');
await p.hover('.chl-item');await p.waitForTimeout(100);
ok(/FUTV/.test(await p.textContent('#chlPrev')),'La vista previa sigue al canal señalado');
await p.click('.chl-item');await p.waitForTimeout(1200);
ok(/FUTV/.test(await p.textContent('#pTitle'))&&await p.textContent('#pFav')==='★','Elegir desde Favoritos cambia de canal (★ en la barra)');
// Último canal
await p.click('#pLast');await p.waitForTimeout(1200);
ok(/Teletica/.test(await p.textContent('#pTitle')),'⇄ vuelve al canal anterior: '+await p.textContent('#pTitle'));
// Apagado automático desde Más
await p.click('#pMore');await p.waitForTimeout(200);
ok(await p.isVisible('#pMenu button >> text=Apagar automáticamente'),'“Más ⋯” tiene apagado automático');
await p.click('#pMenu button >> text=Apagar automáticamente');await p.waitForTimeout(200);
await p.click('#pMenu button >> text=15 minutos');await p.waitForTimeout(200);
await p.evaluate(()=>{});
// Canal caído: opciones y paso automático
await p.click('#pClose');await p.waitForTimeout(300);
await p.click('#g .card >> nth=2');
await p.waitForSelector('.failacts',{timeout:40000});
const acts=await p.$$eval('.failacts button',x=>x.map(y=>y.textContent.trim()));
ok(acts.some(a=>/Probar otra vez/.test(a))&&acts.some(a=>/Siguiente/.test(a))&&acts.some(a=>/Reportar/.test(a)),'Opciones claras cuando falla: '+acts.join(' | '));
ok(/Pasando al siguiente canal en/.test(await p.textContent('#skipLine')),'Cuenta regresiva: '+await p.textContent('#skipLine'));
await p.waitForTimeout(7500);
ok(/Kids TV/.test(await p.textContent('#pTitle')),'Pasó solo al siguiente canal: '+await p.textContent('#pTitle'));
// Cancelar el salto con una tecla
await p.click('#pPrev');await p.waitForSelector('.failacts',{timeout:40000});await p.waitForTimeout(500);
await p.keyboard.press('Shift');await p.waitForTimeout(7000);
ok(/Deportes Caído/.test(await p.textContent('#pTitle'))&&/Te quedas/.test(await p.textContent('#skipLine')),'Una tecla cancela el salto automático');
await p.click('.failacts [data-fa=rep]');await p.waitForTimeout(200);
ok(await p.evaluate(()=>JSON.parse(localStorage['mitv:log']||'[]').some(l=>JSON.stringify(l).includes('reportado'))),'Reportar guarda el canal en el informe');
await p.click('#pClose');
// Inicio: favoritos arriba y lo más visto
const c2=await b.newContext({viewport:{width:1280,height:720}});
await c2.addInitScript(()=>{localStorage['mitv:P:p1:favs']=JSON.stringify([{name:'FUTV (1080p)',url:'http://127.0.0.1:8766/live2.m3u8'}]);localStorage['mitv:P:p1:stats']=JSON.stringify({ch:{'http://x/most.m3u8':{n:'Canal Muy Visto',s:5000,c:'News',logo:'',k:''}},cat:{},day:{}});});
const p2=await c2.newPage();await install(p2);await p2.goto(B+'MiTV.html#no-resume');await p2.waitForTimeout(2000);
const titles=await p2.$$eval('.section-title h3',x=>x.map(y=>y.textContent));
ok(titles[0]==='⭐ Tus favoritos','Favoritos es la primera fila de Inicio: '+titles.slice(0,3).join(' · '));
ok(titles.includes('Lo que más ves')&&/Canal Muy Visto/.test(await p2.textContent('#rMost')),'Fila “Lo que más ves” del perfil');
await c2.close();
// Ajustes: modo noche, apagado, guía
await p.$eval('[data-tab=ajustes]',e=>e.click());await p.waitForTimeout(800);
await p.selectOption('#nightS','on');await p.waitForTimeout(100);
ok(await p.evaluate(()=>document.documentElement.classList.contains('night')),'Modo noche');
await p.selectOption('#nightS','off');
await p.selectOption('#sleepS','30');await p.waitForTimeout(100);
ok(/Se apaga a las/.test(await p.textContent('#sleepStat')),'Apagado automático: '+await p.textContent('#sleepStat'));
await p.evaluate(()=>{});
await p.click('#guideBtn');await p.waitForTimeout(200);
ok(await p.isVisible('.modal #gd')&&/Bienvenido/.test(await p.textContent('.modal')),'Guía “¿Cómo se usa?”');
await p.click('#gdN');await p.click('#gdN');await p.click('#gdN');await p.waitForTimeout(200);
ok(!(await p.isVisible('.modal')),'La guía se recorre y se cierra');
console.log('Errores JS:',errs.length?errs:'ninguno');

// ---------- Android TV (reproductor nativo y botón Atrás) ----------
const ctxA=await b.newContext({viewport:{width:960,height:540},userAgent:TV});
await ctxA.addInitScript(()=>{window.__exit=0;window.MiTVAndroid={isTv:()=>true,hasVoice:()=>false,playNative:j=>{window.__nat=j;},exitApp:()=>{window.__exit++;},setPlaying(){},setBackgroundAudio(){},registerHeaders(){},setStreamHeaders(){}};});
const a=await ctxA.newPage();const errsA=[];a.on('pageerror',e=>errsA.push(e.message));await install(a);
await a.goto(B+'MiTV.html#no-resume');await a.waitForTimeout(2000);
await a.evaluate(()=>{const k='mitv:P:p1:favs';localStorage[k]=JSON.stringify([{name:'FUTV (1080p)',url:'http://127.0.0.1:8766/live2.m3u8'}]);});
await a.evaluate(()=>document.querySelector('#tabs [data-tab=vivo]').focus());await a.keyboard.press('Enter');await a.waitForTimeout(1500);
await a.evaluate(()=>document.querySelectorAll('#g .card')[3].focus());await a.keyboard.press('Enter');await a.waitForTimeout(500);
const nat=JSON.parse(await a.evaluate(()=>window.__nat||'{}'));
ok(nat.items&&nat.items.every(i=>'grp' in i&&'next' in i&&'fav' in i)&&nat.autoSkip===true,'El reproductor nativo recibe categorías, siguiente programa y favoritos');
ok(nat.items&&nat.items.some(i=>i.grp.includes('Deportes')),'Categorías traducidas para el nativo: '+(nat.items||[]).map(i=>i.grp).join(' | '));
// El nativo devuelve un favorito nuevo
await a.evaluate(()=>window.mitvNativeEvent(JSON.stringify({index:0,watched:[],failed:[],favs:[{i:0,on:true}],slept:false})));
ok(await a.evaluate(()=>JSON.parse(localStorage['mitv:P:p1:favs']).some(f=>/Teletica/.test(f.name))),'Favorito marcado en el nativo se guarda en MiTV');
// Recordar el foco por sección
await a.evaluate(()=>document.querySelectorAll('#g .card')[3].focus());
await a.evaluate(()=>document.querySelector('#tabs [data-tab=inicio]').focus());await a.keyboard.press('Enter');await a.waitForTimeout(1200);
await a.evaluate(()=>document.querySelector('#tabs [data-tab=vivo]').focus());await a.keyboard.press('Enter');await a.waitForTimeout(1500);
await a.keyboard.press('ArrowRight');await a.waitForTimeout(150);
ok(await a.evaluate(()=>[...document.querySelectorAll('#g .card')].indexOf(document.activeElement))===3,'Al volver a En vivo, ▶ regresa al último canal enfocado');
// Atrás: sección → Inicio → confirmar salida
await a.keyboard.press('Escape');await a.waitForTimeout(800);
ok(await a.evaluate(()=>document.querySelector('#tabs .active').dataset.tab)==='inicio','Atrás desde una sección lleva a Inicio');
const r1=await a.evaluate(()=>window.mitvBack());await a.waitForTimeout(200);
ok(r1===true&&/Salir de MiTV/.test(await a.textContent('.modal')),'Atrás en Inicio pregunta antes de salir');
ok(await a.evaluate(()=>document.activeElement.id)==='exNo','“Quedarme” está seleccionado por defecto');
await a.keyboard.press('Enter');await a.waitForTimeout(200);
ok(!(await a.isVisible('.modal'))&&await a.evaluate(()=>window.__exit)===0,'Quedarme no cierra la app');
await a.evaluate(()=>window.mitvBack());await a.waitForTimeout(200);await a.click('#exYes');
ok(await a.evaluate(()=>window.__exit)===1,'Salir cierra la app');
// Apagado automático al volver del nativo
await a.evaluate(()=>window.mitvNativeEvent(JSON.stringify({index:0,watched:[],failed:[],favs:[],slept:true})));await a.waitForTimeout(200);
ok(await a.evaluate(()=>getComputedStyle(document.querySelector('#dim')).display)==='block','Si el nativo se apagó por tiempo, MiTV queda en reposo');
console.log('Errores JS (Android):',errsA.length?errsA:'ninguno');
await b.close();})();
