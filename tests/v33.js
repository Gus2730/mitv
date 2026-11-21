const {chromium}=require('playwright');const {install,B}=require('./mocks');
const ok=(c,m)=>console.log((c?'✅':'❌')+' '+m);
const prim=`#EXTM3U
#EXTINF:-1 tvg-id="Teletica.cr" group-title="General",Teletica 7 (720p)
${B}noexiste.m3u8
#EXTINF:-1 group-title="News",Canal 13 (720p)
${B}live.m3u8
`;
const ftv=`#EXTM3U x-tvg-url="https://epgshare01.online/epg_ripper_ALL.xml.gz"
#EXTINF:-1 group-title="Costa Rica",Teletica 7
http://localhost:8766/live2.m3u8
#EXTINF:-1 group-title="Costa Rica",Canal Nuevo
http://localhost:8766/master.m3u8
#EXTINF:-1 group-title="Costa Rica",Canal 4
${B}repetido.m3u8
#EXTINF:-1 group-title="Costa Rica",Canal 6
${B}repetido.m3u8
#EXTINF:-1 group-title="Costa Rica",Canal IP
http://15.204.196.147:22880/X/index.m3u8
#EXTINF:-1 group-title="Costa Rica",Canal Youtube Ⓨ
https://www.youtube.com/@canalprueba/live
#EXTINF:-1 group-title="Mexico",Otro
${B}clip.mp4
`;
(async()=>{const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});const p=await (await b.newContext({viewport:{width:1280,height:800}})).newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
let epgReq=0; p.on('request',r=>{if(/epgshare/.test(r.url()))epgReq++;});
await install(p);
await p.route(/iptv-org\.github\.io|raw\.githubusercontent\.com\/iptv-org/,r=>r.fulfill({status:200,body:prim,headers:{'access-control-allow-origin':'*'}}));
await p.route(/Free-TV/,r=>r.fulfill({status:200,body:ftv,headers:{'access-control-allow-origin':'*'}}));
await p.route(/radio-browser\.info/,r=>{const u=r.request().url();const h={'access-control-allow-origin':'*'};
  if(u.includes('bycountrycodeexact')) return r.fulfill({status:200,contentType:'application/json',headers:h,body:JSON.stringify([{name:'Radio Uno',url_resolved:B+'clip.mp4',tags:'news',stationuuid:'a',countrycode:'CR'},{name:'Radio Dos',url_resolved:B+'clip.mp4',tags:'',stationuuid:'b',countrycode:'CR'}])});
  if(u.includes('tag=costa')) return r.fulfill({status:200,contentType:'application/json',headers:h,body:JSON.stringify([{name:'Radio Dos',url_resolved:B+'clip.mp4',stationuuid:'c',countrycode:''},{name:'Radio Tres Tica',url_resolved:B+'clip.mp4',stationuuid:'d',countrycode:''},{name:'Radio Extranjera',url_resolved:B+'clip.mp4',stationuuid:'e',countrycode:'US'}])});
  r.fulfill({status:200,contentType:'application/json',headers:h,body:'[]'});});
await p.goto(B+'MiTV.html#no-resume'); await p.waitForTimeout(1200); await p.$eval('[data-tab=vivo]',e=>e.click()); await p.waitForTimeout(3500);
const names=await p.$$eval('#g .card .name',n=>n.map(x=>x.textContent)); console.log('Canales:',names.join(' | '));
ok(names.includes('Canal Nuevo'),'Canal nuevo de Free-TV agregado');
ok(names.filter(n=>/Teletica 7/.test(n)).length===1,'Teletica no se repite (el de Free-TV queda como respaldo)');
ok(!names.some(n=>/Canal 4|Canal 6|Canal IP/.test(n)),'Se excluyen enlaces repetidos y de IP sueltas');
ok(names.some(n=>/Teletica · en vivo por YouTube/.test(n)) && names.some(n=>/Repretel · en vivo/.test(n)),'Canales oficiales de YouTube');
ok(names.includes('Canal Youtube'),'Canal de YouTube de Free-TV');
ok(epgReq===0,'No descarga las guías gigantes de Free-TV');
// respaldo automático
await p.click('#g .card:nth-child(1)'); await p.waitForTimeout(16000);
ok(await p.evaluate(()=>document.querySelector('#video').readyState)>=2,'Teletica: falla el enlace principal y entra el de respaldo');
await p.keyboard.press('Escape');
// YouTube oficial
const tIdx=names.findIndex(n=>/Teletica · en vivo/.test(n))+1;
await p.click(`#g .card:nth-child(${tIdx})`); await p.waitForTimeout(1500);
ok(await p.$eval('#pYt iframe',f=>f.src.includes('live_stream?channel=UCOC6n5gbktagxIUrQrp42yw')),'Teletica en vivo por YouTube');
await p.click('#ytMode'); await p.waitForTimeout(800);
ok(await p.$eval('#pYt iframe',f=>f.src.includes('list=UUOC6n5gbktagxIUrQrp42yw')),'Botón Últimos videos');
await p.keyboard.press('Escape');
const yIdx=names.indexOf('Canal Youtube')+1;
await p.click(`#g .card:nth-child(${yIdx})`); await p.waitForTimeout(1200);
ok(/Abrir en YouTube/.test(await p.textContent('#pYt')),'Canal de YouTube por @nombre: en navegador ofrece abrir en YouTube');
await p.keyboard.press('Escape');
// diagnóstico con enlace alterno
await p.click('[data-act=diag]'); await p.waitForTimeout(9000);
const rep=await p.evaluate(()=>document.querySelector('#dgSum').innerText); ok(/Funciona/.test(rep),'Diagnóstico: '+rep.replace(/\s+/g,' ').slice(0,90));
await p.click('#dgNo');
// radio
await p.$eval('[data-tab=radio]',e=>e.click()); await p.waitForTimeout(1500);
const radios=await p.$$eval('#g .card .name',n=>n.map(x=>x.textContent)); console.log('Radios:',radios.join(' | '));
ok(radios.length===3 && radios.includes('Radio Tres Tica') && !radios.includes('Radio Extranjera'),'Radios: país + etiqueta "costa rica", sin repetidas ni extranjeras');
await p.click('[data-r=fav]'); await p.fill('#mrName','Mi Radio Propia'); await p.fill('#mrUrl',B+'clip.mp4'); await p.click('#fMyRadio button'); await p.waitForTimeout(500);
ok((await p.textContent('#g')).includes('Mi Radio Propia'),'Agregar radio propia');
await p.click('#g .card'); await p.waitForTimeout(1500); ok(await p.isVisible('#pAudio'),'La radio propia suena'); await p.keyboard.press('Escape');
// canal propio
await p.$eval('[data-tab=ajustes]',e=>e.click()); await p.fill('#cuName','Mi Canal Propio'); await p.fill('#cuUrl','http://localhost:8766/clip.mp4'); await p.click('#fCustom button'); await p.waitForTimeout(300);
await p.$eval('[data-tab=vivo]',e=>e.click()); await p.waitForTimeout(1500);
ok((await p.textContent('#g')).includes('Mi Canal Propio'),'Canal propio aparece en Costa Rica');
await p.screenshot({path:'v33.png'});
console.log('Errores JS:',errs.length?errs:'ninguno');await b.close();})();
