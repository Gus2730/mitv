const {chromium}=require('playwright');const {install,B}=require('./mocks');
const ok=(c,m)=>console.log((c?'✅':'❌')+' '+m);
const m3u=`#EXTM3U
#EXTINF:-1 group-title="General",Bueno
${B}live.m3u8
#EXTINF:-1 group-title="General",Caido404
${B}noexiste.m3u8
#EXTINF:-1 group-title="General",Pagina
${B}page.m3u8
#EXTINF:-1 group-title="General",SinCors
http://127.0.0.1:8765/live.m3u8
#EXTINF:-1 group-title="General",ConReferer
#EXTVLCOPT:http-referrer=https://ejemplo.cr/
#EXTVLCOPT:http-user-agent=Mozilla/5.0 Prueba
${B}live.m3u8
#EXTINF:-1 group-title="General",Kodi
${B}live.m3u8|Referer=https://otro.cr/&User-Agent=VLC
#EXTINF:-1 group-title="General",VideoNoCarga
${B}badvariant.m3u8
#EXTINF:-1 group-title="General",Apagado (720p) [Not 24/7]
${B}empty.m3u8
`;
(async()=>{const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});const p=await (await b.newContext({viewport:{width:1280,height:800}})).newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await install(p); await p.route(/iptv-org\.github\.io|raw\.githubusercontent\.com/,r=>r.fulfill({status:200,body:m3u,headers:{'access-control-allow-origin':'*'}}));
await p.goto(B+'MiTV.html#no-resume'); await p.waitForTimeout(1200); await p.$eval('[data-tab=vivo]',e=>e.click()); await p.waitForTimeout(6000);
const dots=await p.$$eval('#g .card',cs=>cs.map(c=>c.querySelector('.name').textContent+':'+(c.querySelector('.dot')?c.querySelector('.dot').className.replace('dot ',''):'youtube')));
console.log(dots.join(' | '));
ok(dots[0].endsWith(':ok')&&dots[1].endsWith(':down')&&dots[3].endsWith(':warn')&&dots[4].endsWith(':warn'),'Puntos: verde/gris/amarillo según el motivo');
ok(await p.evaluate(()=>{const it=JSON.parse(localStorage['mitv:c:https://iptv-org.github.io/iptv/countries/cr.m3u']||'null');return true}),'');
ok(await p.evaluate(()=>!!document.querySelector('#g .card:nth-child(6)')) ,'Canal con formato Kodi cargado');
await p.click('[data-act=diag]'); await p.waitForTimeout(9000);
const sum=await p.textContent('#dgSum'); console.log('Resumen:',sum.replace(/\s+/g,' '));
ok(/Funciona/.test(sum)&&/caído/.test(sum)&&/navegador lo bloquea/.test(sum)&&/datos especiales/.test(sum)&&/no lleva a un video/.test(sum)&&/no carga/.test(sum)&&/horario limitado/.test(sum),'Diagnóstico distingue todos los motivos');
await p.screenshot({path:'diag.png'}); await p.click('#dgNo');
// mensaje en el reproductor
await p.click('#g .card:nth-child(2)'); await p.waitForTimeout(12000);
ok(/caído|cambió/.test(await p.textContent('#pMsg')),'Mensaje con motivo: '+(await p.textContent('#pMsg')).replace(/\s+/g,' ').slice(0,110));
await p.keyboard.press('Escape');
await p.click('#g .card:nth-child(5)'); await p.waitForTimeout(800);
ok(/navegador/.test(await p.textContent('#pMsg')),'Canal con datos especiales: aviso inmediato en navegador');
await p.keyboard.press('Escape');
console.log('Errores JS:',errs.length?errs:'ninguno');await b.close();})();
