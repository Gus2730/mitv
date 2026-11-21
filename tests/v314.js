// Pruebas de MiTV 3.14: Continuar viendo y Diagnóstico
const {chromium}=require('playwright');const {install,B}=require('./mocks');
const ok=(c,m)=>console.log((c?'✅':'❌')+' '+m);
(async()=>{const b=await chromium.launch();const errs=[];
const now=Date.now();
const prog={[B+'clip.mp4?peli']:{t:1800,d:5700,ts:now-1000,item:{name:'La Gran Aventura',url:B+'clip.mp4?peli',kind:'vod',poster:''}},
 [B+'clip.mp4?pod']:{t:600,d:2400,ts:now-5000,item:{name:'Episodio 12',url:B+'clip.mp4?pod',kind:'podcast',poster:''}}};
const seed=`localStorage['mitv:welcomed']='true';localStorage['mitv:guided']='true';localStorage['mitv:P:p1:progress']=${JSON.stringify(JSON.stringify(prog))};localStorage['mitv:P:p1:favs']=${JSON.stringify(JSON.stringify([{name:'Repretel 6',url:B+'clip.mp4?r6',logo:'',group:'General'}]))};`;
const ctx=await b.newContext({viewport:{width:1280,height:900}});const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));await install(p);await p.addInitScript(seed);
await p.goto(B+'MiTV.html#no-resume');await p.waitForTimeout(1800);
const order=await p.$$eval('#content .section-title h3',e=>e.map(x=>x.textContent));
ok(/Continuar viendo/.test(order[0]),'Continuar viendo es la primera fila: '+order.slice(0,3).join(' | '));
const grps=await p.$$eval('#rCont .card .grp',e=>e.map(x=>x.textContent));
ok(grps[0]==='Quedan 1 h 5 min','Película: '+grps[0]);
ok(grps[1]==='🎙️ Quedan 30 min','Podcast: '+grps[1]);
await p.screenshot({path:'v314_inicio.png'});
await p.click('#contEdit');await p.waitForTimeout(300);
ok(await p.$('#rCont .grid.editing')!==null,'Modo Editar');
await p.screenshot({path:'v314_editar.png'});
await p.click('#rCont .card[data-i="1"]');await p.waitForTimeout(500);
ok(!(await p.evaluate(()=>document.getElementById('player').classList.contains('open')))&&await p.$$eval('#rCont .card',e=>e.length)===1,'En Editar, tocar quita (no reproduce)');
ok(!JSON.parse(await p.evaluate(()=>localStorage['mitv:P:p1:progress']))[ 'x' ] && Object.keys(JSON.parse(await p.evaluate(()=>localStorage['mitv:P:p1:progress']))).length===1,'Se borra lo guardado');
await p.click('#contEdit');await p.waitForTimeout(200);
await p.click('#rCont .card[data-i="0"]');await p.waitForTimeout(1500);
ok(await p.evaluate(()=>document.getElementById('player').classList.contains('open')),'Al tocar, reproduce');
ok(/Continuando desde/.test(await p.evaluate(()=>[...document.querySelectorAll('.toast')].map(t=>t.textContent).join(' '))),'Retoma donde quedó');
ok(!errs.length,'Errores JS: '+(errs.join(' | ')||'ninguno'));await b.close();})();
