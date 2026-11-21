// Pruebas de MiTV 3.10: celular, encabezado, Guía, Inicio, Películas, bienvenida, texto grande
const {chromium}=require('playwright');const {install,B}=require('./mocks');
const ok=(c,m)=>console.log((c?'✅':'❌')+' '+m);
const TV='Mozilla/5.0 (Linux; Android 9; AFTKA Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36';
(async()=>{
const b=await chromium.launch();const errs=[];
// --- Celular
let ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
let p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));await install(p);
await p.goto(B+'MiTV.html#no-resume');await p.waitForTimeout(2500);
const hb=await p.$eval('header',e=>e.getBoundingClientRect().height);
ok(hb<70,'Encabezado del celular en una fila: '+Math.round(hb)+' px');
const bar=await p.$eval('#tabs',e=>{const r=e.getBoundingClientRect();return {bottom:Math.round(r.bottom),vis:[...e.querySelectorAll('button')].filter(b=>b.offsetParent).map(b=>b.dataset.tab||b.id)}});
ok(bar.bottom===844&&bar.vis.length===5,'Barra inferior con 5 botones: '+bar.vis.join(', '));
ok(!(await p.isVisible('#q')),'Buscador escondido tras la lupa');
await p.tap('#qBtn');await p.waitForTimeout(200);ok(await p.isVisible('#q'),'La lupa abre el buscador');
await p.fill('#q','');await p.tap('#tabs [data-tab=inicio]');await p.waitForTimeout(300);
await p.tap('#moreTab');await p.waitForTimeout(300);
const more=await p.$$eval('.morebtn',e=>e.map(x=>x.dataset.t));ok(more.includes('ajustes')&&more.includes('radio')&&!more.includes('guia'),'Hoja "Más": '+more.join(', '));
await p.screenshot({path:'v310_mas.png'});
await p.tap('.morebtn[data-t=radio]');await p.waitForTimeout(800);
ok(await p.$eval('#moreTab',e=>e.classList.contains('active')),'"Más" queda marcado en secciones secundarias');
await p.tap('#tabs [data-tab=inicio]');await p.waitForTimeout(3500);
ok(!(await p.$('#wx')),'Clima no disponible queda oculto');
const recVis=await p.$$eval('#rRec .card',c=>c.filter(x=>x.style.display!=='none').map(x=>x.innerText.split('\n')[1]||x.innerText));
ok(recVis.length>0&&!recVis.some(t=>/Caído/.test(t)),'Recomendados sin canales caídos: '+recVis.join(' | '));
await p.screenshot({path:'v310_movil.png'});
await p.tap('#tabs [data-tab=peliculas]');await p.waitForTimeout(1200);
ok(await p.$eval('#side .active',e=>/cine gratis/i.test(e.textContent)),'Películas abre "Canales de cine gratis" si la colección está vacía');
// bienvenida
await p.evaluate(()=>window.mitvTest.firstRun());await p.waitForTimeout(400);
await p.screenshot({path:'v310_bienv1.png'});
await p.tap('.wlc [data-c=cr]');await p.tap('#wlN');await p.waitForTimeout(2000);
const n=await p.$$eval('.wlch',e=>e.length);ok(n>0,'Bienvenida: canales para elegir ('+n+')');
await p.tap('.wlch[data-i="0"]');await p.tap('.wlch[data-i="1"]');
await p.screenshot({path:'v310_bienv2.png'});
await p.tap('#wlN');await p.waitForTimeout(300);
ok(/2 favoritos/.test(await p.textContent('#wl')),'Bienvenida guarda 2 favoritos');
await p.tap('#wlN');await p.waitForTimeout(1200);
ok(await p.$('#rFav .card')!==null,'Los favoritos salen en Inicio');
ok(await p.evaluate(()=>localStorage['mitv:welcomed'])==='true','Bienvenida marcada como vista');
await ctx.close();
// --- PC
ctx=await b.newContext({viewport:{width:1280,height:720}});p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));await install(p);
await p.goto(B+'MiTV.html#no-resume');await p.waitForTimeout(2000);
const av=await p.$eval('#profBtn',e=>e.getBoundingClientRect().top);ok(av<20,'PC: avatar en la misma fila del menú (top '+Math.round(av)+')');
ok(!(await p.isVisible('#tabs [data-tab=guia]')),'Guía oculta sin fuente');
ok(!(await p.isVisible('#moreTab'))&&!(await p.isVisible('#qBtn')),'PC sin barra de celular');
await p.$eval('[data-tab=ajustes]',e=>e.click());await p.waitForTimeout(800);
await p.fill('#eUrl',B+'guia.xml.gz');await p.click('#fEpg button');await p.waitForTimeout(1500);
ok(await p.isVisible('#tabs [data-tab=guia]'),'Guía aparece al agregar una fuente');
await p.selectOption('#txtS','xl');await p.waitForTimeout(200);
ok(await p.evaluate(()=>document.documentElement.classList.contains('txt-xl')&&getComputedStyle(document.body).zoom==='1.28'),'Texto muy grande');
await p.screenshot({path:'v310_pc_xl.png'});
await p.selectOption('#txtS','normal');
await p.$eval('[data-tab=inicio]',e=>e.click());await p.waitForTimeout(1000);await p.screenshot({path:'v310_pc.png'});
await ctx.close();
// --- TV
ctx=await b.newContext({viewport:{width:960,height:540},userAgent:TV});p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));await install(p);
await p.goto(B+'MiTV.html#no-resume');await p.waitForTimeout(2500);
ok(!(await p.isVisible('#moreTab'))&&await p.isVisible('#tabs [data-tab=vivo]'),'TV conserva su menú');
await p.screenshot({path:'v310_tv.png'});
ok(!errs.length,'Errores JS: '+(errs.join(' | ')||'ninguno'));
await b.close();})();
