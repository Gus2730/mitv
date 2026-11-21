// Pruebas de MiTV 3.11: contenido de Costa Rica
const {chromium}=require('playwright');const {install,B}=require('./mocks');
const ok=(c,m)=>console.log((c?'✅':'❌')+' '+m);
(async()=>{const b=await chromium.launch();const errs=[];
const p=await (await b.newContext({viewport:{width:1280,height:800}})).newPage();p.on('pageerror',e=>errs.push(e.message));await install(p);
await p.route(/radio-browser\.info/,r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify([
 {name:'Radio Columbia 98.7',url_resolved:B+'clip.mp4',tags:'news',stationuuid:'c1',lastcheckok:1},
 {name:'Radio Monumental',url_resolved:B+'clip.mp4?m',tags:'news',stationuuid:'c2',lastcheckok:1},
 {name:'Radio Reloj',url_resolved:B+'clip.mp4?r',tags:'news',stationuuid:'c3',lastcheckok:0},
 {name:'Radio Prueba',url_resolved:B+'clip.mp4?p',tags:'music',stationuuid:'c4',lastcheckok:1}])}));
await p.goto(B+'MiTV.html#no-resume');await p.waitForTimeout(1500);
await p.$eval('[data-tab=vivo]',e=>e.click());await p.waitForTimeout(3000);
const names=await p.$$eval('#g .card .name',e=>e.map(x=>x.textContent));
for (const n of ['Canal 13 SINART','Multimedios Canal 8','Asamblea Legislativa · en vivo','Asamblea Legislativa · sesiones']) ok(names.some(x=>x.includes(n)),'En vivo incluye '+n);
await p.$eval('[data-tab=radio]',e=>e.click());await p.waitForTimeout(2500);
const top=await p.$$eval('#gTop .card .name',e=>e.map(x=>x.textContent));
ok(top[0]&&/Radio Nacional/.test(top[0]),'Destacadas empieza con Radio Nacional');
ok(top.some(t=>/Columbia/.test(t))&&top.some(t=>/Monumental/.test(t))&&!top.some(t=>/Reloj/.test(t)),'Destacadas toma del directorio solo las que responden: '+top.join(' | '));
await p.screenshot({path:'v311_radio.png'});
await p.click('[data-r=pod]');await p.waitForTimeout(800);
await p.click('#podCr [data-q="Noticias Costa Rica"]');await p.waitForTimeout(1500);
ok(await p.inputValue('#podQ')==='Noticias Costa Rica'&&await p.$('#podRes .card, #gRes .card, .card')!==null,'Atajo de podcasts busca "Noticias Costa Rica"');
await p.screenshot({path:'v311_pod.png'});
ok(!errs.length,'Errores JS: '+(errs.join(' | ')||'ninguno'));await b.close();})();
