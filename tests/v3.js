const {chromium}=require('playwright');const {install,B,db}=require('./mocks');
const ok=(c,m)=>console.log((c?'✅':'❌')+' '+m);
(async()=>{
const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
const ctx=await b.newContext({viewport:{width:1366,height:820},acceptDownloads:true});
await ctx.addInitScript(()=>{ delete window.showSaveFilePicker; });
const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); await install(p);
await p.goto(B+'MiTV.html#no-resume'); await p.waitForTimeout(1500);
ok(!(await p.$('#splash')),'Pantalla de carga se oculta');
ok(await p.$eval('#tabs .active',e=>e.dataset.tab)==='inicio','Inicio por defecto');
await p.waitForSelector('#rRec .card',{timeout:8000}).catch(()=>{});
ok(await p.locator('#rRec .card').count()>0,'Recomendados: '+await p.locator('#rRec .card').count());
await p.waitForTimeout(1500);
ok((await p.textContent('#rSport')).includes('Saprissa'),'Deportes hoy en Inicio');
ok(await p.locator('#rApps .appcard').count()===8,'Accesos a apps');
const [pop]=await Promise.all([p.waitForEvent('popup',{timeout:3000}).catch(()=>null),p.click('#rApps [data-a="0"]')]); ok(!!pop,'Abre sitio de la app'); if(pop) await pop.close();
ok(await p.isVisible('#micBtn')===(await p.evaluate(()=>!!(window.SpeechRecognition||window.webkitSpeechRecognition))),'Botón de voz según el navegador');
// ver canales
await p.$eval('[data-tab=vivo]',e=>e.click()); await p.waitForTimeout(800);
await p.click('.card >> nth=0'); await p.waitForTimeout(2500); await p.keyboard.press('Escape');
await p.click('.card >> nth=1'); await p.waitForTimeout(2000);
ok(await p.isVisible('#pLast'),'Botón canal anterior');
await p.click('#pLast'); await p.waitForTimeout(1200); ok((await p.textContent('#pTitle')).includes('Teletica'),'Canal anterior → '+await p.textContent('#pTitle'));
await p.keyboard.press('l'); await p.waitForTimeout(1200); ok((await p.textContent('#pTitle')).includes('Canal 13'),'Tecla L → '+await p.textContent('#pTitle'));
await p.waitForTimeout(11000);
ok(await p.evaluate(()=>{const k=Object.keys(localStorage).find(k=>k.endsWith(':stats'));return JSON.parse(localStorage[k]).day[new Date().toLocaleDateString('sv')]>0}),'Estadísticas registradas');
ok(await p.isVisible('#ticker'),'Marcador en vivo en reproductor: '+(await p.textContent('#ticker')).slice(0,50));
await p.keyboard.press('Escape');
// pausa en vivo
await p.click('.card >> nth=4'); await p.waitForTimeout(3500);
ok(await p.isVisible('#pBack') && await p.isVisible('#pLive'),'Controles de pausa en vivo');
await p.click('#pBack'); await p.waitForTimeout(500); ok(/En vivo/.test(await p.textContent('#pLive')),'Botón En vivo: '+await p.textContent('#pLive'));
// grabar
await p.click('#pMore'); await p.click('#pMenu button >> text=Grabar ahora'); await p.waitForTimeout(5000);
ok(await p.isVisible('#recDot'),'Indicador de grabación');
const [dl]=await Promise.all([p.waitForEvent('download',{timeout:8000}).catch(()=>null),(async()=>{await p.click('#pMore');await p.click('#pMenu button >> text=Detener');})()]);
if(dl){const fs=require('fs');const path=await dl.path();ok(fs.statSync(path).size>1000,'Grabación descargada: '+dl.suggestedFilename()+' '+fs.statSync(path).size+' bytes');} else ok(false,'Grabación descargada');
await p.keyboard.press('Escape');
// agenda
await p.$eval('[data-tab=deportes]',e=>e.click()); await p.click('[data-s=agenda]'); await p.waitForTimeout(1200);
const agTxt=await p.textContent('#agList'); ok(agTxt.includes('Herediano')&&agTxt.includes('EN VIVO'),'Agenda de partidos');
ok(await p.locator('#agList [data-play]').count()===2,'Botón Ver en canal (coincide FUTV/Teletica)');
await p.click('#agList [data-rem]'); await p.waitForTimeout(300);
ok(await p.evaluate(()=>JSON.parse(localStorage['mitv:reminders']).length)===1,'Recordatorio guardado');
await p.waitForTimeout(16000);
ok(await p.locator('.modal >> text=Herediano').count()>0,'Recordatorio avisa (modal)');
await p.click('#rGo').catch(()=>{}); await p.waitForTimeout(1500); ok((await p.textContent('#pTitle')).includes('Teletica'),'Desde el aviso abre el canal');
await p.keyboard.press('Escape');
// radio
await p.$eval('[data-tab=radio]',e=>e.click()); await p.waitForTimeout(1000);
ok((await p.textContent('#g')).includes('Radio Prueba'),'Radios de Costa Rica');
await p.click('#g .card'); await p.waitForTimeout(1500); ok(await p.isVisible('#pAudio'),'Interfaz de radio');
await p.click('#pFav'); await p.click('#dimBtn'); ok(await p.isVisible('#dim'),'Apagar pantalla'); await p.keyboard.press('Escape'); ok(!(await p.isVisible('#dim')),'Encender pantalla');
await p.keyboard.press('Escape');
await p.click('[data-r=fav]'); ok((await p.textContent('#g')).includes('Radio Prueba'),'Mis radios');
// podcasts
await p.click('[data-r=pod]'); await p.fill('#podQ','prueba'); await p.click('#fPod button'); await p.waitForTimeout(1200);
ok((await p.textContent('#gRes')).includes('Podcast Prueba'),'Búsqueda de podcasts');
await p.click('#gRes .card'); await p.waitForTimeout(1200); ok((await p.textContent('#eps')).includes('Episodio 1'),'Episodios del podcast');
await p.click('#sub'); await p.waitForTimeout(300); ok(await p.evaluate(()=>{const k=Object.keys(localStorage).find(k=>k.endsWith(':pods'));return JSON.parse(localStorage[k]).length===1}),'Suscripción');
// YouTube
await p.$eval('[data-tab=ajustes]',e=>e.click()); await p.fill('#ytName','Canal YT'); await p.fill('#ytUrl','https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv'); await p.click('#fYt button'); await p.waitForTimeout(300);
await p.$eval('[data-tab=vivo]',e=>e.click()); await p.click('[data-list=yt]'); await p.waitForTimeout(500); await p.click('#g .card'); await p.waitForTimeout(1500);
ok(await p.$eval('#pYt iframe',f=>f.src.includes('UUabcdefghijklmnopqrstuv')),'YouTube embebido');
await p.keyboard.press('Escape');
// voz
await p.evaluate(()=>window.mitvVoice('pon Canal 13')); await p.waitForTimeout(1200);
ok((await p.textContent('#pTitle')).includes('Canal 13'),'Voz "pon Canal 13"'); await p.keyboard.press('Escape');
// límite infantil
await p.click('#profBtn'); await p.fill('#npn','Niños'); await p.check('#npk'); await p.click('#npf button'); await p.keyboard.press('Escape');
await p.$eval('[data-tab=ajustes]',e=>e.click()); await p.waitForTimeout(300);
await p.fill('[data-lim]','1'); await p.dispatchEvent('[data-lim]','change'); await p.waitForTimeout(400);
ok(await p.evaluate(()=>JSON.parse(localStorage['mitv:profiles']).find(x=>x.kids).limitMin)===1,'Límite infantil guardado');
await p.screenshot({path:'v3_ajustes.png',fullPage:true});
// actualizaciones
await p.fill('#homeIn',B); await p.click('#fHome button'); await p.click('#updChk'); await p.waitForTimeout(1000);
ok(await p.isVisible('#updBar'),'Aviso de nueva versión: '+(await p.textContent('#updBar')).slice(0,45));
// nube
await p.fill('#cKey','k'); await p.fill('#cDb','https://fake-rtdb.test'); await p.fill('#cMail','a@b.com'); await p.fill('#cPass','123456');
await p.click('#fCloud [data-op=signUp]'); await p.waitForTimeout(2000);
ok(!!(db.users&&db.users.uid0&&db.users.uid0.state),'Datos subidos a la nube');
ok(await p.isVisible('#remoteBtn'),'Botón control remoto');
const ctx2=await b.newContext({viewport:{width:420,height:860}}); const q=await ctx2.newPage(); await install(q);
await q.goto(B+'MiTV.html#no-resume'); await q.waitForTimeout(1500); await q.$eval('[data-tab=ajustes]',e=>e.click());
await q.fill('#cKey','k'); await q.fill('#cDb','https://fake-rtdb.test'); await q.fill('#cMail','a@b.com'); await q.fill('#cPass','123456');
await q.click('#fCloud [data-op=signInWithPassword]'); await q.waitForTimeout(2500);
const profs=await q.evaluate(()=>JSON.parse(localStorage['mitv:profiles']).map(x=>x.name).join(','));
ok(profs.includes('Niños'),'Otro dispositivo recibe perfiles: '+profs);
// control remoto desde q hacia p
await q.click('#remoteBtn'); await q.waitForTimeout(800);
ok(await q.isVisible('.remote'),'Control remoto abierto');
await q.screenshot({path:'v3_remote.png'});
await q.fill('#rmText','FUTV'); await q.click('#rmSay button'); await p.waitForTimeout(5000);
ok(await p.isVisible('#player') && (await p.textContent('#pTitle')).includes('FUTV'),'Control remoto puso FUTV en el otro dispositivo');
await q.click('.remote [data-k=back]'); await p.waitForTimeout(4000); ok(!(await p.isVisible('#player')),'Botón Atrás remoto');
// último canal al abrir
const p3=await ctx.newPage(); await install(p3); await p3.goto(B+'MiTV.html'); await p3.waitForTimeout(1500); await p3.click('.prof .p.on'); await p3.waitForTimeout(2500);
ok(await p3.isVisible('#player'),'Al abrir pone el último canal: '+await p3.textContent('#pTitle'));
await p3.keyboard.press('Escape'); await p3.waitForTimeout(400); await p3.screenshot({path:'v3_inicio.png'});
console.log('Errores JS:',errs.length?errs:'ninguno');
await b.close();})();
