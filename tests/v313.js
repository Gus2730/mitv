// Pruebas de MiTV 3.13: portada destacada, logos uniformes, marcador en vivo y radio
const {chromium}=require('playwright');const {install,B}=require('./mocks');
const ok=(c,m)=>console.log((c?'✅':'❌')+' '+m);
const TV='Mozilla/5.0 (Linux; Android 9; AFTKA Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36';
const svg=(c,t)=>'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M32 3l25 9v19c0 15-11 25-25 30C18 56 7 46 7 31V12z" fill="${c}" stroke="#fff" stroke-width="3"/><text x="32" y="40" font-size="18" font-family="Arial" font-weight="bold" fill="#fff" text-anchor="middle">${t}</text></svg>`);
const now=Date.now();
const espn={events:[{id:'1',date:new Date(now-50*60e3).toISOString(),status:{displayClock:"52'",type:{state:'in',shortDetail:"52'"}},competitions:[{competitors:[{homeAway:'home',score:'1',team:{shortDisplayName:'Saprissa',logo:svg('#6b2c91','S')}},{homeAway:'away',score:'0',team:{shortDisplayName:'Alajuelense',logo:svg('#d61f26','LDA')}}],broadcasts:[{names:['FUTV']}]}]},
 {id:'2',date:new Date(now+4*60e3).toISOString(),status:{type:{state:'pre',shortDetail:'8:00 PM'}},competitions:[{competitors:[{homeAway:'home',score:'0',team:{shortDisplayName:'Herediano',logo:svg('#d4a017','CSH')}},{homeAway:'away',score:'0',team:{shortDisplayName:'Cartaginés',logo:svg('#1f4fa3','CSC')}}],broadcasts:[{names:['Teletica']}]}]}]};
async function page(b,opts,init){const ctx=await b.newContext(opts);const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));await install(p);
 await p.route(/site\.api\.espn\.com/,r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(r.request().url().includes('crc.1')?espn:{events:[]})}));
 if(init) await p.addInitScript(init);return p;}
(async()=>{const b=await chromium.launch();const errs=[];
const last={name:'Teletica 7',url:B+'clip.mp4?t7',logo:svg('#0a63c9','7'),group:'General'};
const seed=`localStorage['mitv:welcomed']='true';localStorage['mitv:guided']='true';localStorage['mitv:P:p1:lastLive']=${JSON.stringify(JSON.stringify(last))};localStorage['mitv:P:p1:favs']=${JSON.stringify(JSON.stringify([{name:'Repretel 6',url:B+'clip.mp4?r6',logo:'',group:'General'},last]))};`;
// PC
let p=await page(b,{viewport:{width:1280,height:800}},seed);
await p.goto(B+'MiTV.html#no-resume');await p.waitForTimeout(1500);
ok(await p.isVisible('#heroBox'),'Portada destacada en Inicio');
ok(/Seguir viendo/i.test(await p.textContent('#heroBox'))&&/Teletica 7/.test(await p.textContent('#heroBox')),'La portada muestra el último canal');
await p.waitForTimeout(2500);
const dots=await p.$$('#heroBox .hdots i');ok(dots.length>=3,'Partido en vivo agregado a la portada ('+dots.length+' destacados)');
await p.click('#heroBox .hdots i[data-h="0"]');await p.waitForTimeout(600);
ok(/EN VIVO/.test(await p.textContent('#heroBox'))&&/Saprissa/.test(await p.textContent('#heroBox')),'Destacado del partido: marcador y escudos');
await p.mouse.move(5,790);await p.screenshot({path:'v313_inicio_pc.png'});
const sizes=await p.$$eval('#rFav .thumb>img,#rRec .thumb>img',e=>[...new Set(e.filter(x=>x.complete&&x.naturalWidth).map(x=>Math.round(x.getBoundingClientRect().width)+'x'+Math.round(x.getBoundingClientRect().height)))]);
ok(sizes.length<=1,'Logos del mismo tamaño en las tarjetas: '+sizes.join(', '));
ok(await p.$('#rSport .matchcard.live')!==null,'Tarjeta de partido en vivo resaltada');
await p.$eval('[data-tab=deportes]',e=>e.click());await p.waitForTimeout(600);
const ag=await p.$('[data-s=agenda]');if(ag){await ag.click();await p.waitForTimeout(1500);}
ok(await p.$('.match.live')!==null,'Agenda: partido en vivo resaltado con escudos');
await p.screenshot({path:'v313_agenda.png'});
// Radio
await p.evaluate(()=>window.mitvTest&&0);
await p.$eval('[data-tab=radio]',e=>e.click());await p.waitForTimeout(2500);
const rc=await p.$('#g .card');if(rc){await rc.click();await p.waitForTimeout(2500);}
ok(await p.isVisible('#pAudio .eq')&&await p.isVisible('#aFav'),'Pantalla de radio con ondas y botón de favorito');
ok(await p.$eval('#pAudio',e=>e.classList.contains('playing')),'Las ondas se animan mientras suena');
await p.screenshot({path:'v313_radio.png'});
await p.click('#aFav');await p.waitForTimeout(300);ok(/En favoritos/.test(await p.textContent('#aFav')),'Favorito desde la radio');
errs.push(...p.errs);
// Celular
p=await page(b,{viewport:{width:390,height:844},isMobile:true,hasTouch:true},seed);
await p.goto(B+'MiTV.html#no-resume');await p.waitForTimeout(4200);
const hb=await p.$eval('#heroBox',e=>{const r=e.getBoundingClientRect();return r.right<=390&&r.height<320});ok(hb,'Portada cabe en el celular');
await p.screenshot({path:'v313_movil.png'});errs.push(...p.errs);
// TV: ◀ ▶ cambian de destacado
p=await page(b,{viewport:{width:960,height:540},userAgent:TV},seed);
await p.goto(B+'MiTV.html#no-resume');await p.waitForTimeout(4200);
await p.focus('#heroBox');const t1=await p.textContent('#heroBox .hslide');await p.keyboard.press('ArrowRight');await p.waitForTimeout(600);
const t2=await p.textContent('#heroBox .hslide');ok(t1!==t2&&await p.evaluate(()=>document.activeElement.id)==='heroBox','TV: ▶ cambia de destacado sin salir de la portada');
await p.screenshot({path:'v313_tv.png'});errs.push(...p.errs);
ok(!errs.length,'Errores JS: '+(errs.join(' | ')||'ninguno'));await b.close();})();
