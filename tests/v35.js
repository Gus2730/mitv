const {chromium}=require('playwright');const {install,B}=require('./mocks');
const ok=(c,m)=>console.log((c?'✅':'❌')+' '+m);
const UA='Mozilla/5.0 (Linux; Android 9; AFTKA Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36';
async function extra(p){
  await p.route(/api\.open-meteo\.com/,r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({current:{temperature_2m:23.6,weather_code:2,is_day:1},daily:{temperature_2m_max:[27],temperature_2m_min:[17],precipitation_probability_max:[60]}})}));
  await p.route(/embed\.waze\.com/,r=>r.fulfill({status:200,contentType:'text/html',body:'<body style="background:#123">mapa</body>'}));
  await p.route(/site\.api\.espn\.com/,r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(r.request().url().includes('crc.1')?{events:[{id:'9',date:new Date(Date.now()-3*3600e3).toISOString(),status:{type:{state:'post',shortDetail:'Final'}},competitions:[{competitors:[{homeAway:'home',score:'2',team:{shortDisplayName:'Saprissa'}},{homeAway:'away',score:'1',team:{shortDisplayName:'Herediano'}}],broadcasts:[]}]}]}:{events:[]})}));
  await p.route(/youtube\.com\/results/,r=>r.fulfill({status:200,contentType:'text/html',body:'resultados'}));
}
(async()=>{
const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
const ctx=await b.newContext({viewport:{width:1280,height:720},userAgent:UA});
await ctx.route(/youtube\.com\/results/,r=>r.fulfill({status:200,contentType:'text/html',body:'resultados'}));
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));await install(p);await extra(p);
await p.goto(B+'MiTV.html#no-resume');await p.waitForTimeout(2500);
ok((await p.textContent('#wx')).includes('24°'),'Clima en Inicio: '+(await p.textContent('#wx')).replace(/\s+/g,' ').trim());
await p.click('#trafBtn');await p.waitForTimeout(500);ok(await p.$eval('.traffic iframe',f=>f.src.includes('embed.waze.com')),'Tráfico (mapa de Waze)');await p.keyboard.press('Escape');
// reproductor: banner, lista de canales, solo audio
await p.$eval('[data-tab=vivo]',e=>e.click());await p.waitForTimeout(1500);
await p.evaluate(()=>document.querySelector('#g .card').focus());await p.keyboard.press('Enter');await p.waitForTimeout(2500);
ok(await p.isVisible('#osd')&&/Teletica/.test(await p.textContent('#osd')),'Banner del canal al cambiar: '+(await p.textContent('#osd')).replace(/\s+/g,' ').trim().slice(0,60));
await p.evaluate(()=>document.querySelector('#video').focus());await p.keyboard.press('Enter');await p.waitForTimeout(300);
ok(await p.isVisible('#chList')&&await p.evaluate(()=>document.activeElement.classList.contains('chl-item')),'OK abre la lista de canales con números');
await p.keyboard.press('ArrowDown');await p.keyboard.press('Enter');await p.waitForTimeout(1500);
ok(!(await p.isVisible('#chList'))&&/Canal 13/.test(await p.textContent('#pTitle')),'Elegir de la lista cambia de canal → '+await p.textContent('#pTitle'));
await p.evaluate(()=>document.querySelector('#video').focus());await p.keyboard.press('Enter');await p.waitForTimeout(200);await p.keyboard.press('Escape');await p.waitForTimeout(200);
ok(!(await p.isVisible('#chList'))&&await p.isVisible('#player'),'Atrás cierra solo la lista');
await p.evaluate(()=>{document.querySelector('#pMore').click();});await p.waitForTimeout(200);await p.click('#pMenu button >> text=Solo audio');await p.waitForTimeout(400);
ok(await p.evaluate(()=>document.querySelector('#player').classList.contains('audioonly'))&&await p.isVisible('#pAudio'),'Solo audio activado');
await p.evaluate(()=>{document.querySelector('#pMore').click();});await p.waitForTimeout(200);await p.click('#pMenu button >> text=familia');await p.waitForTimeout(200);
await p.keyboard.press('Escape');await p.waitForTimeout(300);
// PLUS
await p.$eval('[data-tab=plus]',e=>e.click());await p.waitForTimeout(2500);
const reg=await p.$$eval('#pReg .card .name',n=>n.map(x=>x.textContent));const yt=await p.$$eval('#pYtR .card .name',n=>n.map(x=>x.textContent));
ok(reg.length>0&&!reg.some(n=>/Teletica 7/.test(n)),'PLUS: regionales sin los canales nacionales: '+reg.join(', '));
ok(yt.some(n=>/Teletica · en vivo/.test(n)),'PLUS: Costa Rica en YouTube');
ok(await p.locator('#pFam .card').count()===1,'PLUS: favoritos de la familia');
ok(await p.locator('#pApps .appcard').count()>0,'PLUS: apps oficiales');
// resumen de partido
await p.$eval('[data-tab=deportes]',e=>e.click());await p.click('[data-s=agenda]');await p.waitForTimeout(1500);
const [pop]=await Promise.all([p.waitForEvent('popup',{timeout:4000}).catch(()=>null),p.click('[data-hl]').catch(()=>null)]);
ok(pop&&pop.url().includes('resumen'),'Botón Resumen del partido terminado → '+(pop?decodeURIComponent(pop.url()).slice(-35):'no'));if(pop)await pop.close();
// informe de errores
await p.evaluate(()=>setTimeout(()=>{throw new Error('Error de prueba MiTV')},0));await p.waitForTimeout(300);
await p.$eval('[data-tab=ajustes]',e=>e.click());await p.waitForTimeout(600);
const rep=await p.textContent('#repPre');ok(/Arranque: \d+ ms/.test(rep)&&/Flechazo promedio/.test(rep),'Informe muestra arranque y velocidad: '+rep.split('\n')[3]);
ok(await p.evaluate(()=>JSON.parse(localStorage['mitv:log']).some(l=>/Error de prueba/.test(l.msg))),'Errores quedan registrados');
// sin conexión
await ctx.setOffline(true);await p.route(/countries\/mx\.m3u|Free-TV/,r=>r.abort('internetdisconnected'));await p.waitForTimeout(400);
ok(await p.isVisible('#netBar'),'Aviso sin conexión');
await p.$eval('[data-tab=vivo]',e=>e.click());await p.click('[data-country=mx]');await p.waitForTimeout(1500);
ok(/Sin conexión/.test(await p.textContent('#g')),'Lista nueva sin internet: mensaje claro');
await p.click('[data-country=cr]');await p.waitForTimeout(800);ok(await p.locator('#g .card').count()>0,'Lista guardada se ve sin internet');
await ctx.setOffline(false);await p.unroute(/countries\/mx\.m3u|Free-TV/);await p.waitForTimeout(500);ok(!(await p.isVisible('#netBar')),'Aviso desaparece al volver internet');
// arranque rápido: lista vieja se muestra al instante y se actualiza por detrás
await p.evaluate(()=>{const k='mitv:c:https://iptv-org.github.io/iptv/countries/cr.m3u';const v=JSON.parse(localStorage[k]);v.t=Date.now()-48*3600e3;localStorage[k]=JSON.stringify(v);});
const p2=await ctx.newPage();await install(p2);await extra(p2);let netCr=0;p2.on('request',r=>{if(/countries\/cr\.m3u/.test(r.url()))netCr++;});
const t0=Date.now();await p2.goto(B+'MiTV.html#no-resume');await p2.waitForTimeout(1200);await p2.$eval('[data-tab=vivo]',e=>e.click());await p2.waitForSelector('#g .card');const ms=Date.now()-t0;await p2.waitForTimeout(1500);
ok(netCr>=1&&await p2.evaluate(()=>Date.now()-JSON.parse(localStorage['mitv:c:https://iptv-org.github.io/iptv/countries/cr.m3u']).t<60e3),'Lista vieja se mostró y se actualizó por detrás');
await p2.close();
// protector de pantalla
await p.evaluate(()=>{const c=JSON.parse(localStorage['mitv:cfg']);c.saverMin=0.05;localStorage['mitv:cfg']=JSON.stringify(c);});
const p3=await ctx.newPage();await install(p3);await extra(p3);await p3.goto(B+'MiTV.html#no-resume');await p3.waitForTimeout(23000);
ok(await p3.isVisible('#saver')&&/24°/.test(await p3.textContent('#saver')),'Protector de pantalla con hora y clima: '+(await p3.textContent('#saver')).replace(/\s+/g,' ').trim().slice(0,60));
const tabBefore=await p3.evaluate(()=>document.querySelector('#tabs .active').dataset.tab);await p3.keyboard.press('ArrowRight');await p3.waitForTimeout(200);
ok(!(await p3.isVisible('#saver')),'Una tecla quita el protector');
await p3.screenshot({path:'v35_inicio.png'});await p3.close();
console.log('Errores JS:',errs.filter(e=>!/Error de prueba/.test(e)).length?errs:'ninguno');
// reproductor nativo (Android simulado)
const ctxA=await b.newContext({viewport:{width:960,height:540},userAgent:UA});
await ctxA.addInitScript(()=>{window.MiTVAndroid={isTv:()=>true,hasVoice:()=>false,playNative:j=>{window.__nat=j;},setPlaying(){},setBackgroundAudio(){},registerHeaders(){},setStreamHeaders(){}};});
const a=await ctxA.newPage();const errsA=[];a.on('pageerror',e=>errsA.push(e.message));await install(a);await extra(a);
await a.goto(B+'MiTV.html#no-resume');await a.waitForTimeout(2000);await a.$eval('[data-tab=vivo]',e=>e.click());await a.waitForTimeout(1500);
await a.evaluate(()=>document.querySelector('#g .card:nth-child(2)').focus());await a.keyboard.press('Enter');await a.waitForTimeout(600);
const nat=await a.evaluate(()=>window.__nat&&JSON.parse(window.__nat));
ok(nat&&nat.items.length>=3&&nat.items[nat.index].name.includes('Canal 13')&&!(await a.isVisible('#player')),'Canal en vivo se abre en el reproductor nativo con toda la lista ('+(nat?nat.items.length:0)+' canales, empieza en '+(nat?nat.items[nat.index].name:'-')+')');
await a.evaluate(()=>window.mitvNativeEvent(JSON.stringify({index:0,watched:[{i:0,secs:120},{i:1,secs:60}],failed:[2]})));await a.waitForTimeout(500);
const st=await a.evaluate(()=>{const k=Object.keys(localStorage).find(k=>k.endsWith(':stats'));return JSON.parse(localStorage[k]).day[new Date().toLocaleDateString('sv')];});
ok(st>=180,'Al volver: se guardan los minutos vistos ('+st+' s) y el último canal');
console.log('Errores JS (Android):',errsA.length?errsA:'ninguno');
await b.close();})();
