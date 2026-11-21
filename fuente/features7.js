/* =====================================================================
   GustiTV 3.10 · Revisión: celular, Guía, Inicio, bienvenida, texto grande
   ===================================================================== */

/* ---------- Celular: barra de pestañas abajo + "Más" + buscador tras lupa ---------- */
const MAIN_TABS = ['inicio', 'vivo', 'deportes', 'peliculas'];
const TAB_ICON = { inicio: '🏠', vivo: '📺', deportes: '⚽', peliculas: '🎬', guia: '🗓️', radio: '📻', plus: '➕', multi: '🔲', favoritos: '⭐', ajustes: '⚙️' };
const isPhone = () => !IS_TV && matchMedia('(max-width:760px)').matches;
function tabLabel(t){ const b = document.querySelector(`#tabs [data-tab="${t}"]`); return b ? [...b.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim() : t; }
function setupMobileNav(){
  if (IS_TV) return;
  const tabs = $('#tabs');
  // Íconos para la barra inferior (solo se ven en celular)
  tabs.querySelectorAll('button[data-tab]').forEach(b => {
    if (!b.querySelector('.ti')) b.insertAdjacentHTML('afterbegin', `<span class="ti" aria-hidden="true">${TAB_ICON[b.dataset.tab] || '•'}</span>`);
    if (!MAIN_TABS.includes(b.dataset.tab)) b.classList.add('xtra');
  });
  if (!$('#moreTab')){
    tabs.insertAdjacentHTML('beforeend', '<button id="moreTab" class="moretab" aria-label="Más secciones"><span class="ti" aria-hidden="true">☰</span>Más</button>');
    $('#moreTab').onclick = e => { e.stopPropagation(); openMoreSheet(); };
  }
  if (!$('#qBtn')){
    $('#micBtn').insertAdjacentHTML('beforebegin', '<button class="iconbtn" id="qBtn" title="Buscar" aria-label="Buscar">🔍</button>');
    $('#qBtn').onclick = () => {
      const h = document.querySelector('header'); h.classList.toggle('sopen');
      if (h.classList.contains('sopen')) setTimeout(() => $('#q').focus(), 30);
    };
    $('#q').addEventListener('blur', () => { if (!$('#q').value) setTimeout(() => document.querySelector('header').classList.remove('sopen'), 150); });
  }
}
function openMoreSheet(){
  const list = ['guia', 'radio', 'favoritos', 'plus', 'multi', 'ajustes'].filter(t => {
    const b = document.querySelector(`#tabs [data-tab="${t}"]`); return b && b.style.display !== 'none';
  });
  const md = openModal(`<h3>Más secciones</h3><div class="moregrid">${list.map(t => `<button class="morebtn ${S.tab === t ? 'active' : ''}" data-t="${t}"><span>${TAB_ICON[t]}</span>${esc(tabLabel(t))}</button>`).join('')}</div>
    <div class="actions"><button class="btn ghost" id="mClose">Cerrar</button></div>`);
  md.classList.add('sheet');
  md.querySelector('.moregrid').onclick = e => { const b = e.target.closest('[data-t]'); if (!b) return; closeModal(); S.tab = b.dataset.t; render(); window.scrollTo(0, 0); };
  md.querySelector('#mClose').onclick = closeModal;
}
function markMoreTab(){
  const m = $('#moreTab'); if (m) m.classList.toggle('active', !MAIN_TABS.includes(S.tab));
}

/* ---------- Guía: solo se muestra cuando hay una fuente ---------- */
function updGuideTab(){
  const b = document.querySelector('#tabs [data-tab="guia"]'); if (!b) return;
  const has = epgSources().length > 0;
  b.style.display = has || S.tab === 'guia' ? '' : 'none';
}

/* ---------- Inicio: quitar de "Recomendados" los canales que no responden ---------- */
async function pruneRecommended(target){
  if (!S.cfg.health || !target) return;
  const grid = target.querySelector('.grid'); if (!grid || !grid._items) return;
  const list = grid._items;
  const hide = i => {
    const c = grid.querySelector(`.card[data-i="${i}"]`);
    if (c && document.activeElement !== c) c.style.display = 'none';
  };
  list.forEach((it, i) => { const h = S.health[hk(it)]; if (h && h.ok === false) hide(i); });
  const todo = list.map((it, i) => [it, i]).filter(([it]) => !noProbe(it) && !(S.health[hk(it)] && Date.now() - S.health[hk(it)].t < HEALTH_MIN * 60e3));
  const worker = async () => {
    while (todo.length && S.tab === 'inicio' && !player.classList.contains('open')){
      const [it, i] = todo.shift();
      try {
        const r = await probe(it);
        S.health[hk(it)] = { ok: r.why === 'ok', why: r.why, code: r.code, alt: r.alt, t: Date.now() };
        if (r.why !== 'ok' && !APP_ONLY.includes(r.why)) hide(i);
      } catch(e){}
    }
  };
  await Promise.all(Array.from({ length: LITE ? 2 : 4 }, worker));
  store.set('health', S.health);
  // Si todo quedó oculto, mostrar un mensaje en vez de una fila vacía
  if (![...grid.querySelectorAll('.card')].some(c => c.style.display !== 'none'))
    target.innerHTML = '<div class="empty">Ahora mismo no encontramos canales recomendados disponibles.</div>';
}

/* ---------- Texto grande ---------- */
function applyTextSize(){
  const v = S.cfg.textSize || 'normal';
  document.documentElement.classList.toggle('txt-l', v === 'l');
  document.documentElement.classList.toggle('txt-xl', v === 'xl');
}

/* ---------- Bienvenida de primer uso: país → favoritos → listo ---------- */
async function firstRun(){
  let step = 0, cc = S.country === 'spa' ? 'cr' : (S.country || 'cr');
  let items = [], picked = new Set(P.favs.map(f => f.url));
  const md = openModal('<div id="wl"></div>', { onClose: () => store.set('welcomed', true) });
  md.classList.add('welcome');
  const box = md.querySelector('#wl');
  const dots = () => `<div class="gdots">${[0, 1, 2].map(i => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</div>`;
  const draw = async () => {
    if (step === 0){
      box.innerHTML = `<h3>👋 Bienvenido a GustiTV</h3><p class="sub">¿De qué país quieres ver canales primero? Lo puedes cambiar cuando quieras.</p>
        <div class="wlc">${COUNTRIES.map(([c, n, f]) => `<button class="chip ${c === cc ? 'active' : ''}" data-c="${c}">${f} ${esc(n)}</button>`).join('')}</div>
        ${dots()}<div class="actions"><button class="btn ghost" id="wlS">Saltar</button><button class="btn" id="wlN">Siguiente</button></div>`;
      box.querySelector('.wlc').onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; cc = b.dataset.c; box.querySelectorAll('.wlc .chip').forEach(x => x.classList.toggle('active', x === b)); };
      (box.querySelector('.wlc .active') || box.querySelector('#wlN')).focus();
    } else if (step === 1){
      box.innerHTML = `<h3>⭐ Elige tus favoritos</h3><p class="sub">Toca los canales que más ves. Aparecerán primero en Inicio.</p>
        <div class="wlf"><div class="loading">Cargando canales…</div></div>
        ${dots()}<div class="actions"><button class="btn ghost" id="wlB">Atrás</button><button class="btn" id="wlN">Siguiente</button></div>`;
      try { items = visibleItems(await countryItems(cc)).filter(it => !it.local).slice(0, 24); } catch(e){ items = []; }
      if (step !== 1) return;
      const wf = box.querySelector('.wlf');
      wf.innerHTML = items.length ? items.map((it, i) => `<button class="wlch ${picked.has(it.url) ? 'on' : ''}" data-i="${i}" style="--tc:${tileColor(it.name)}">
          ${it.logo ? `<img src="${esc(it.logo)}" alt="" loading="lazy" onerror="this.remove()">` : `<b>${esc(initials(it.name))}</b>`}<span>${esc(it.name)}</span></button>`).join('')
        : '<div class="empty">No se pudieron cargar los canales. Puedes elegir favoritos después con ☆.</div>';
      wf.onclick = e => { const b = e.target.closest('[data-i]'); if (!b) return; const u = items[+b.dataset.i].url; picked.has(u) ? picked.delete(u) : picked.add(u); b.classList.toggle('on', picked.has(u)); };
      box.querySelector('#wlB').onclick = () => { step = 0; draw(); bind(); };
      (wf.querySelector('.wlch') || box.querySelector('#wlN')).focus();
    } else {
      const n = items.filter(it => picked.has(it.url)).length;
      box.innerHTML = `<h3>✅ ¡Listo!</h3><p class="sub" style="font-size:18px">${n ? `Guardamos ${n} favorito${n > 1 ? 's' : ''}. ` : ''}Encuentras tus canales en Inicio y todos los demás en “En vivo”.</p>
        ${dots()}<div class="actions"><button class="btn ghost" id="wlB">Atrás</button><button class="btn" id="wlN">Empezar</button></div>`;
      box.querySelector('#wlB').onclick = () => { step = 1; draw(); bind(); };
      box.querySelector('#wlN').focus();
    }
    bind();
  };
  const bind = () => {
    const s = box.querySelector('#wlS'); if (s) s.onclick = () => { store.set('welcomed', true); closeModal(); };
    const n = box.querySelector('#wlN'); if (!n) return;
    n.onclick = () => {
      if (step === 0){ S.country = cc; S.userList = null; store.set('country', cc); step = 1; draw(); return; }
      if (step === 1){ items.forEach(it => setFav(it, picked.has(it.url))); step = 2; draw(); return; }
      store.set('welcomed', true); closeModal(); S.tab = 'inicio'; render();
      if (!store.get('guided', false)) setTimeout(() => { if (!modals.length) showGuide(); }, 400);
    };
  };
  draw();
}

/* ---------- Ajustes ---------- */
function ajustesExtra7(target){
  if (!target) return;
  target.insertAdjacentHTML('beforeend', `<div class="box"><h3>🔠 Lectura</h3>
    <div class="row"><div class="field" style="max-width:300px"><label>Tamaño del texto</label><select id="txtS">
      ${[['normal', 'Normal'], ['l', 'Grande'], ['xl', 'Muy grande (para ver de lejos)']].map(([v, n]) => `<option value="${v}" ${(S.cfg.textSize || 'normal') === v ? 'selected' : ''}>${n}</option>`).join('')}
    </select></div></div>
    <div class="row"><button class="btn ghost" id="wlAgain">👋 Repetir la bienvenida</button></div></div>`);
  $('#txtS').onchange = e => { S.cfg.textSize = e.target.value; saveCfg(); applyTextSize(); };
  $('#wlAgain').onclick = () => firstRun();
}

/* ---------- Envolver render para mantener todo al día ---------- */
const render7 = render;
let moviesTouched = false;
render = function(){
  // Películas: si "Mi colección" está vacía, abrir primero los canales de cine gratis
  if (S.tab === 'peliculas' && !moviesTouched){
    moviesTouched = true;
    if (S.moviesView === 'mine' && !S.movies.length) S.moviesView = 'free';
  }
  updGuideTab();
  const r = render7.apply(this, arguments);
  markMoreTab();
  if (S.tab === 'guia' && !epgSources().length) side.style.display = 'none';
  if (S.tab === 'inicio'){
    const wx = $('#wx');
    // Esconder el clima si no está disponible (en vez de mostrar "Clima no disponible")
    if (wx) new MutationObserver((m, o) => { if (/no disponible/i.test(wx.textContent)){ wx.remove(); o.disconnect(); } }).observe(wx, { childList: true, subtree: true });
    const rec = $('#rRec');
    if (rec) new MutationObserver((m, o) => { if (rec.querySelector('.grid')){ o.disconnect(); pruneRecommended(rec); } }).observe(rec, { childList: true });
  }
  return r;
};

/* ---------- Rendimiento: en TV cargar más canales solo cuando se llega al final ---------- */
function autoMore(){
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting){ io.unobserve(e.target); e.target.click(); } }), { rootMargin: '300px' });
  new MutationObserver(() => content.querySelectorAll('[data-act=more]:not([data-io])').forEach(b => { b.dataset.io = '1'; io.observe(b); }))
    .observe(content, { childList: true, subtree: true });
}

function startup7(){
  applyTextSize();
  setupMobileNav();
  updGuideTab(); markMoreTab();
  autoMore();
  if (!store.get('welcomed', false) && !store.get('guided', false) && !navigator.webdriver)
    setTimeout(() => { if (!modals.length && !player.classList.contains('open')) firstRun(); else store.set('welcomed', true); }, 1200);
}
window.mitvTest = Object.assign(window.mitvTest || {}, { firstRun, applyTextSize, updGuideTab });

/* ---------- Listas IPTV: explicar por qué no se pudo leer y ofrecer salidas ---------- */
function listErrInfo(url, err){
  const m = String((err && err.message) || ''), code = (m.match(/HTTP (\d+)/) || [])[1];
  if (navigator.onLine === false) return { t: 'No hay conexión a internet.' };
  if (code === '401' || code === '403') return { t: `El servidor rechazó el acceso (código ${code}). Revisa que el enlace esté completo y que tu suscripción siga activa.` };
  if (code === '404' || code === '410') return { t: `No hay ninguna lista en esa dirección (código ${code}). Revisa que el enlace esté bien copiado.` };
  if (code) return { t: `El servidor de la lista respondió con un error (código ${code}). Prueba de nuevo más tarde.` };
  if (android) return { t: 'No se pudo conectar con el servidor de la lista. Revisa el enlace y tu conexión.' };
  if (location.protocol === 'https:' && /^http:/i.test(url))
    return { t: 'El enlace empieza con “http://” (sin la “s”). Por seguridad, el navegador no deja que una página segura lea enlaces http.', web: true };
  return { t: 'El servidor de esa lista no permite que páginas web la lean. Es una protección del navegador, no un problema de la lista.', web: true };
}
function listFail(name, url, err){
  const info = listErrInfo(url, err);
  logEvent('lista', (err && err.message) || '');
  if (!info.web){ toast('No se pudo agregar la lista. ' + info.t); return; }
  const md = openModal(`<h3>⚠️ El navegador no pudo leer la lista</h3>
    <p>${esc(info.t)}</p>
    <p style="margin-bottom:6px"><b>Qué puedes hacer:</b></p>
    <ul class="lfopts">
      <li>📱 <b>Usar la app Android</b> (TV o celular): ahí esta lista sí se lee. Si la guardas y tienes la cuenta en la nube activada, también te aparece allá.</li>
      <li>📁 <b>Descargarla y subirla como archivo</b>: abre el enlace, guarda el archivo .m3u y súbelo aquí.</li>
    </ul>
    <p class="muted" style="font-size:13px">Aun subiéndola, en el navegador algunos canales de esa lista podrían no reproducirse por la misma protección. En la app Android sí funcionan.</p>
    <div class="actions"><button class="btn ghost" id="lfC">Cancelar</button><a class="btn ghost" id="lfO" href="${esc(url)}" target="_blank" rel="noopener">⬇️ Abrir enlace</a><button class="btn ghost" id="lfU">📁 Subir archivo</button><button class="btn" id="lfS">Guardar igual</button></div>`);
  md.querySelector('#lfC').onclick = closeModal;
  md.querySelector('#lfU').onclick = () => { closeModal(); $('#fileM3u').click(); };
  md.querySelector('#lfS').onclick = () => {
    S.lists.push({ id: 'l' + Date.now(), name, url }); store.set('lists', S.lists);
    closeModal(); toast('Lista guardada. Ábrela desde la app Android o súbela como archivo aquí.'); render();
  };
}
