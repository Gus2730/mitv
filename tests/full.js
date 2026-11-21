const {chromium}=require('playwright');
const B='http://127.0.0.1:8766/';
const m3u=`#EXTM3U
#EXTINF:-1 tvg-id="Teletica.cr@SD" tvg-logo="" group-title="General",Teletica 7 (720p)
${B}master.m3u8
#EXTINF:-1 tvg-id="Canal13.cr" group-title="News",Canal 13 (720p) [Not 24/7]
${B}live.m3u8
#EXTINF:-1 group-title="Sports",Deportes Caído
http://127.0.0.1:9/nada.m3u8
#EXTINF:-1 group-title="Kids;Animation",Kids TV
${B}clip.mp4
#EXTINF:-1 group-title="Movies",Cine Clásico TV
${B}live.m3u8
`;
const ok=(c,m)=>console.log((c?'✅':'❌')+' '+m);
(async()=>{
const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']}); const ctx=await b.newContext({viewport:{width:1366,height:800}}); const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.route(/iptv-org\.github\.io|raw\.githubusercontent\.com/,r=>r.fulfill({status:200,body:m3u,headers:{'access-control-allow-origin':'*'}}));
await p.route(/api\.themoviedb\.org/,r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({results:[{title:'La Gran Aventura',release_date:'2017-10-27',poster_path:'/x.jpg',overview:'Una sinopsis de prueba.',vote_average:8.2}]})}));
await p.route(/image\.tmdb\.org/,r=>r.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#c33"/></svg>'}));
await p.route(/jf\.local/,r=>{const u=r.request().url();const h={'access-control-allow-origin':'*','content-type':'application/json'};
  if(u.includes('AuthenticateByName')) return r.fulfill({status:200,headers:h,body:JSON.stringify({AccessToken:'TOK',User:{Id:'U1',Name:'gus'}})});
  if(u.includes('IncludeItemTypes=Movie')) return r.fulfill({status:200,headers:h,body:JSON.stringify({Items:[{Id:'m1',Name:'Película del servidor',ProductionYear:2020,Type:'Movie',MediaSources:[{Container:'mp4'}],ImageTags:{}}]})});
  if(u.includes('/Videos/m1/stream')) return r.fulfill({status:302,headers:{location:B+'clip.mp4','access-control-allow-origin':'*'}});
  return r.fulfill({status:404,headers:h,body:'{}'});});
await p.goto(B+'MiTV.html'); await p.waitForTimeout(1200); await p.$eval('[data-tab=vivo]',e=>e.click()); await p.waitForSelector('#g .card');
await p.waitForTimeout(4000);
const dots=await p.$$eval('.card .dot',d=>d.map(x=>x.className));
ok(dots.filter(d=>d.includes('ok')).length>=3 && dots.some(d=>d.includes('down')), 'Revisión de canales: '+dots.join(','));
ok((await p.textContent('#hstat')).includes('responden'), 'Estado: '+await p.textContent('#hstat'));
ok((await p.textContent('.card >> nth=1')).includes('horario limitado'),'Etiqueta traducida');
// número
await p.keyboard.press('2'); await p.waitForTimeout(1800);
ok(await p.isVisible('#player') && (await p.textContent('#pTitle')).includes('Canal 13'),'Zapping con número 2 → '+await p.textContent('#pTitle'));
await p.keyboard.press('Escape');
// calidad
await p.click('.card >> nth=0'); await p.waitForTimeout(3500);
ok(await p.isVisible('#pQual'),'Botón calidad visible: '+await p.textContent('#pQual'));
await p.click('#pQual'); const qm=await p.$$eval('#pMenu button',b=>b.map(x=>x.textContent)); ok(qm.length===3,'Menú calidad: '+qm.join(' | '));
await p.click('#pMenu button >> text=360p'); await p.waitForTimeout(2500); ok((await p.textContent('#pQual')).includes('360'),'Calidad cambiada: '+await p.textContent('#pQual'));
ok(await p.isVisible('#pPip'),'Botón ventana flotante');
await p.keyboard.press('Escape');
// reconexión / caído
await p.click('.card >> nth=2'); await p.waitForTimeout(1500);
const m1=await p.textContent('#pMsg'); 
await p.waitForTimeout(12000); const m2=await p.textContent('#pMsg');
ok(/Reconectando/.test(m1) && /no está disponible/.test(m2),'Reconexión: "'+m1.trim()+'" → "'+m2.trim().slice(0,40)+'"');
await p.keyboard.press('Escape');
// vista previa
await p.hover('.card >> nth=1'); await p.waitForTimeout(2500);
ok(await p.$('.card video.prev')!==null,'Vista previa al pasar el cursor');
await p.mouse.move(5,5);
// EPG
await p.$eval('[data-tab=ajustes]',e=>e.click()); await p.fill('#eUrl',B+'guia.xml.gz'); await p.click('#fEpg button'); await p.waitForTimeout(1500);
ok((await p.textContent('#epgList')).includes('guia.xml.gz'),'Guía agregada');
await p.$eval('[data-tab=guia]',e=>e.click()); await p.waitForTimeout(1500);
const rows=await p.$$eval('.guide-row',r=>r.map(x=>x.innerText.replace(/\s+/g,' ').slice(0,90))); ok(rows.length===2,'Guía: '+rows.join(' || '));
await p.$eval('[data-tab=vivo]',e=>e.click()); await p.waitForTimeout(1500);
ok((await p.textContent('.card >> nth=0')).includes('Ahora: Telenoticias'),'Ahora en tarjeta');
await p.click('.card >> nth=0'); await p.waitForTimeout(800); ok((await p.textContent('#pSub')).includes('Sigue: Buen Día'),'Ahora/Sigue en reproductor: '+await p.textContent('#pSub'));
// ocultar canal
await p.click('#pMore'); await p.click('#pMenu button >> text=Ocultar'); await p.waitForTimeout(500); await p.keyboard.press('Escape'); await p.waitForTimeout(800);
ok(!(await p.$$eval('#g .card .name',n=>n.map(x=>x.textContent))).some(n=>n.startsWith('Teletica 7')),'Canal ocultado (Teletica 7; queda el de YouTube)');
// tema
await p.$eval('[data-tab=ajustes]',e=>e.click()); await p.click('[data-theme=claro]'); ok(await p.evaluate(()=>document.documentElement.dataset.theme)==='claro','Tema claro');
await p.check('#big'); ok(await p.evaluate(()=>document.documentElement.classList.contains('big')),'Letra grande');
await p.screenshot({path:'f_ajustes.png'});
await p.click('#hiddenList button'); // mostrar de nuevo
await p.click('[data-theme=""]'); await p.uncheck('#big');
// TMDB + continuar + subtitulos
await p.fill('#tKey','abc123'); await p.click('#fTmdb button');
await p.$eval('[data-tab=peliculas]',e=>e.click()); await p.setInputFiles('#fileMovies','media/La Gran Aventura 2017 1080p.webm'); await p.waitForTimeout(1500);
ok(await p.$('.posters img[src*="x.jpg"]')!==null,'Portada TMDB');
await p.click('#g .card'); await p.waitForTimeout(300); ok((await p.textContent('.modal')).includes('Una sinopsis de prueba'),'Ficha con sinopsis');
await p.click('#dPlay'); await p.waitForTimeout(1500);
await p.evaluate(()=>{const v=document.querySelector('#video');v.currentTime=60;}); await p.waitForTimeout(6500);
await p.click('#pSubs'); const [fc]=await Promise.all([p.waitForEvent('filechooser'),p.click('#pMenu button >> nth=0')]); await fc.setFiles('media/subs.srt'); await p.waitForTimeout(800);
ok(await p.evaluate(()=>[...document.querySelector('#video').textTracks].some(t=>t.mode==='showing')),'Subtítulos activos');
await p.keyboard.press('Escape'); await p.waitForTimeout(800);
ok((await p.textContent('#content')).includes('Continuar viendo'),'Fila Continuar viendo');
await p.click('#gc .card'); ok((await p.textContent('.modal')).includes('Continuar'),'Botón Continuar');
await p.click('#dPlay'); await p.waitForTimeout(1500); const ct=await p.evaluate(()=>document.querySelector('#video').currentTime); ok(ct>55,'Reanuda en '+ct.toFixed(0)+'s');
await p.keyboard.press('Escape');
// Jellyfin
await p.$eval('[data-tab=ajustes]',e=>e.click()); await p.fill('#jfS','http://jf.local:8096'); await p.fill('#jfU','gus'); await p.fill('#jfP','x'); await p.click('#fJf button'); await p.waitForTimeout(800);
ok((await p.textContent('#content')).includes('Conectado a'),'Jellyfin conectado');
await p.$eval('[data-tab=peliculas]',e=>e.click()); await p.click('[data-v=jf-movies]'); await p.waitForTimeout(800);
ok((await p.textContent('#g')).includes('Película del servidor'),'Películas de Jellyfin');
await p.click('#g .card'); await p.click('#dPlay'); await p.waitForTimeout(2500);
ok(await p.evaluate(()=>document.querySelector('#video').readyState)>=2,'Reproduce desde Jellyfin');
await p.keyboard.press('Escape');
// Multivista
await p.$eval('[data-tab=multi]',e=>e.click()); await p.click('[data-l="2"]');
for (const i of [0,1]){ await p.click(`[data-pick="${i}"]`); await p.click('#pkSrc [data-k=cr]'); await p.waitForTimeout(400); await p.click(`#pkList [data-i="${i}"]`); await p.waitForTimeout(300); }
await p.waitForTimeout(3000);
const mv=await p.$$eval('.slot video',v=>v.map(x=>({rs:x.readyState,m:x.muted})));
ok(mv.length===2 && mv.every(x=>x.rs>=2) && mv.filter(x=>!x.m).length===1,'Multivista 2 canales: '+JSON.stringify(mv));
await p.click('[data-sel="1"]'); ok(await p.$eval('.slot[data-s="1"]',e=>e.classList.contains('audio')),'Cambio de audio');
await p.screenshot({path:'f_multi.png'});
// PIN + parental + perfiles
await p.$eval('[data-tab=ajustes]',e=>e.click()); await p.click('#pinSet'); await p.fill('#np','1234'); await p.click('#npOk'); await p.waitForTimeout(300);
await p.click('#lockCats input[value=news]'); ok(await p.evaluate(()=>JSON.parse(localStorage['mitv:cfg']).lockedCats.includes('news')),'Categoría Noticias bloqueada');
await p.evaluate(()=>{}); 
// expirar desbloqueo
await p.$eval('[data-tab=vivo]',e=>e.click()); await p.waitForTimeout(800);
ok((await p.textContent('.card >> nth=1')).includes('🔒'),'Candado en canal de noticias');
await p.evaluate(()=>{ /* forzar expiración */ });
await p.click('#profBtn'); await p.fill('#npn','Niños'); await p.check('#npk'); await p.click('#npf button'); await p.waitForTimeout(300);
await p.click('.prof [data-p]:not(.on) >> nth=0'); await p.waitForTimeout(800);
const kidsNames=await p.$$eval('#g .card .name',n=>n.map(x=>x.textContent)); ok(kidsNames.length===1&&kidsNames[0]==='Kids TV','Perfil infantil solo muestra: '+kidsNames.join(','));
await p.screenshot({path:'f_kids.png'});
// intentar salir: debe pedir PIN (desbloqueo de 10 min aún vigente → forzar)
await p.evaluate(()=>{}); 
await p.click('#profBtn'); await p.click('.prof [data-p]:not(.on) >> nth=0'); await p.waitForTimeout(300);
const askedPin=await p.$('#pinIn')!==null; ok(askedPin,'Pide PIN para salir del perfil infantil');
if(askedPin){ await p.fill('#pinIn','1234'); await p.waitForTimeout(600); }
ok(await p.evaluate(()=>document.querySelector('#profBtn').textContent)==='P','Volvió a perfil Principal');
// backup
await p.$eval('[data-tab=ajustes]',e=>e.click()); await p.click('#expBtn'); const code=await p.inputValue('#code'); ok(code.startsWith('MITV2:'),'Código de respaldo ('+code.length+' caracteres)');
await p.keyboard.press('Escape');
const p2=await (await b.newContext()).newPage(); await p2.route(/iptv-org\.github\.io|raw\.githubusercontent\.com/,r=>r.fulfill({status:200,body:m3u,headers:{'access-control-allow-origin':'*'}}));
await p2.goto(B+'MiTV.html'); await p2.waitForSelector('.card'); await p2.$eval('[data-tab=ajustes]',e=>e.click()); await p2.click('#impBtn'); await p2.fill('#code',code); await p2.click('#cOk'); await p2.waitForTimeout(2500);
ok(await p2.evaluate(()=>JSON.parse(localStorage['mitv:profiles']).length)===2,'Importado en otro dispositivo (2 perfiles)');
console.log('Errores JS:',errs.length?errs:'ninguno');
await b.close();})();
