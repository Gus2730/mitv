/* =====================================================================
   MiTV 3.8 · Navegación y experiencia de uso
   ===================================================================== */

/* ---------- Favoritos desde cualquier lugar ---------- */
function setFav(it, on){
  if (!it || it.local) return;
  const has = isFav(it.url);
  if (on && !has) P.favs.push({ name: it.name, url: it.url, logo: it.logo, group: it.group, id: it.id, kind: it.kind, poster: it.poster, jf: it.jf, key: it.key });
  if (!on && has) P.favs = P.favs.filter(f => f.url !== it.url);
  pstore.set('favs', P.favs);
}

/* ---------- Datos extra para el reproductor nativo (siguiente programa, categorías, favorito) ---------- */
function nativeExtra(it){
  const nn = nowNext(it);
  return {
    next: nn && nn.next ? nn.next.title + ' · ' + fmtTime(new Date(nn.next.start)) : '',
    grp: (it.group || '').split(';').map(g => g.trim()).filter(Boolean).map(catName).join(';'),
    fav: isFav(it.url)
  };
}

/* ---------- Lista de canales del reproductor web: categorías, favoritos y vista previa ---------- */
function chlPreview(it){
  const p = $('#chlPrev'); if (!p || !it) return;
  const nn = !isVod(it) ? nowNext(it) : null;
  p.innerHTML = `<b>${esc(it.name)}</b>` +
    (nn && nn.now ? `<span>Ahora: ${esc(nn.now.title)} · hasta ${fmtTime(new Date(nn.now.stop))}</span>` : `<span>${esc((it.group || '').split(';').map(g => catName(g.trim())).join(' · ') || 'Sin guía de programación')}</span>`) +
    (nn && nn.next ? `<small>Sigue: ${esc(nn.next.title)} · ${fmtTime(new Date(nn.next.start))}</small>` : '');
}
function openChannelList(focusChip){
  const ctx = S.current; if (!ctx) return;
  const items = ctx.items, box = $('#chList');
  const groups = [...new Set(items.flatMap(i => (i.group || '').split(';').map(s => s.trim()).filter(Boolean)))]
    .sort((a, b) => catName(a).localeCompare(catName(b), 'es')).slice(0, 40);
  if (S.chlCat && S.chlCat !== '__fav' && !groups.includes(S.chlCat)) S.chlCat = '';
  const sel = S.chlCat || '';
  const idx = items.map((_, i) => i).filter(i => !sel || (sel === '__fav' ? isFav(items[i].url) : hasCat(items[i], sel.toLowerCase())));
  const chip = (v, label) => `<button class="chip ${sel === v ? 'active' : ''}" data-cat="${esc(v)}">${esc(label)}</button>`;
  box.innerHTML = `<div class="chl-head"><b>Canales</b><button class="btn ghost small" id="chlOpts">⚙ Opciones</button></div>
    <div class="chl-cats">${chip('', 'Todos')}${chip('__fav', '★ Favoritos')}${groups.map(g => chip(g, catName(g))).join('')}</div>
    <div class="chl-list">${idx.slice(0, 400).map(i => {
      const it = items[i], nn = !isVod(it) ? nowNext(it) : null;
      return `<div class="chl-row"><button class="chl-item ${i === ctx.index ? 'on' : ''}" data-i="${i}"><span class="chl-n">${i + 1}</span>
        <span class="chl-l">${it.logo ? `<img src="${esc(it.logo)}" alt="" loading="lazy" onerror="this.remove()">` : ''}</span>
        <span class="chl-t"><b>${esc(it.name)}</b>${nn && nn.now ? `<small>${esc(nn.now.title)}</small>` : ''}</span></button>
        ${it.local ? '' : `<button class="chl-fav ${isFav(it.url) ? 'on' : ''}" data-f="${i}" aria-label="${isFav(it.url) ? 'Quitar de favoritos' : 'Agregar a favoritos'}">${isFav(it.url) ? '★' : '☆'}</button>`}</div>`;
    }).join('') || `<p class="muted" style="padding:12px">${sel === '__fav' ? 'Todavía no tienes favoritos en esta lista. Toca ☆ junto a un canal para agregarlo.' : 'No hay canales en esta categoría.'}</p>`}
    ${idx.length > 400 ? `<p class="muted" style="padding:8px">Y ${idx.length - 400} más: usa los números del control.</p>` : ''}</div>
    <div class="chl-prev" id="chlPrev"></div>`;
  box.classList.add('show');
  player.classList.remove('idle');
  chlPreview(items[ctx.index]);
  const cur = focusChip ? box.querySelector('.chl-cats .chip.active') : (box.querySelector(`.chl-item[data-i="${ctx.index}"]`) || box.querySelector('.chl-item'));
  if (cur){ cur.focus({ preventScroll: true }); if (!focusChip) cur.scrollIntoView({ block: 'center' }); }
  const onFocus = e => { const b = e.target.closest && e.target.closest('.chl-item'); if (b) chlPreview(items[+b.dataset.i]); };
  box.onfocusin = onFocus; box.onmouseover = onFocus;
  box.onclick = e => {
    if (e.target.closest('#chlOpts')){ closeChannelList(); poke(); $('#pClose').focus(); return; }
    const c = e.target.closest('.chl-cats .chip');
    if (c){ S.chlCat = c.dataset.cat; openChannelList(true); return; }
    const f = e.target.closest('.chl-fav');
    if (f){
      const it = items[+f.dataset.f]; setFav(it, !isFav(it.url));
      f.textContent = isFav(it.url) ? '★' : '☆'; f.classList.toggle('on', isFav(it.url));
      toast(isFav(it.url) ? '★ ' + it.name + ' agregado a favoritos' : it.name + ' quitado de favoritos');
      if (S.current.items[S.current.index] === it) $('#pFav').textContent = isFav(it.url) ? '★' : '☆';
      return;
    }
    const b = e.target.closest('.chl-item'); if (!b) return;
    closeChannelList(); play(items, +b.dataset.i);
  };
}

/* ---------- Canal caído: opciones claras y paso automático al siguiente ---------- */
let skipTimer = null, skipStreak5 = 0;
function cancelAutoSkip(){
  if (!skipTimer) return;
  clearInterval(skipTimer); skipTimer = null;
  const l = $('#skipLine'); if (l) l.textContent = 'Te quedas en este canal.';
}
function officialFor(it){
  const mine = baseName(it.name);
  if (!mine) return null;
  const list = officialYt('cr').concat(S.country !== 'cr' && S.country !== 'spa' ? officialYt(S.country) : []);
  return list.find(o => baseName(o.name).split(' ').some(w => w.length > 4 && w !== 'noticias' && w !== 'youtube' && mine.includes(w))) || null;
}
function failActions(it){
  if (!S.current || S.current.items[S.current.index] !== it || !pMsg.classList.contains('show')) return;
  cancelAutoSkip();
  const many = S.current.items.length > 1;
  const yt = officialFor(it);
  pMsg.insertAdjacentHTML('beforeend', `<div class="failacts">
    <button class="btn small" data-fa="retry">↻ Probar otra vez</button>
    ${many ? '<button class="btn small" data-fa="next">▼ Siguiente canal</button>' : ''}
    ${yt ? '<button class="btn small" data-fa="yt">▶ Ver en YouTube oficial</button>' : ''}
    <button class="btn small ghost" data-fa="rep">⚑ Reportar</button></div>
    <p id="skipLine" class="muted" style="margin:10px 0 0;font-size:14px"></p>`);
  pMsg.querySelector('.failacts').onclick = e => {
    const b = e.target.closest('[data-fa]'); if (!b) return;
    cancelAutoSkip();
    const a = b.dataset.fa;
    if (a === 'retry'){ delete it._url; retries = 0; if (hls){ hls.destroy(); hls = null; } showMsg('Conectando…', true); startSource(it); }
    else if (a === 'next') step(1);
    else if (a === 'yt') play([yt], 0);
    else if (a === 'rep'){ logEvent('reporte', 'Canal caído reportado: ' + it.name + ' · ' + playUrl(it)); toast('Reporte guardado. Lo puedes enviar desde Ajustes → Informe para soporte'); }
  };
  if (IS_TV) pMsg.querySelector('[data-fa]').focus({ preventScroll: true });
  if (many && S.cfg.autoSkip !== false && skipStreak5 < Math.min(5, S.current.items.length - 1)){
    let left = 6;
    const line = $('#skipLine');
    const tick = () => {
      if (!S.current || S.current.items[S.current.index] !== it || !player.classList.contains('open')){ cancelAutoSkip(); return; }
      if (left <= 0){ clearInterval(skipTimer); skipTimer = null; skipStreak5++; step(1); return; }
      line.textContent = `Pasando al siguiente canal en ${left}… (toca o presiona una tecla para quedarte)`;
      left--;
    };
    tick(); skipTimer = setInterval(tick, 1000);
  } else if (skipStreak5 >= 5){
    $('#skipLine').textContent = 'Varios canales seguidos no responden. Revisa tu conexión o elige otro de la lista.';
  }
}
// Cualquier toque o tecla del usuario cancela el salto automático
['keydown', 'pointerdown'].forEach(ev => player.addEventListener(ev, e => { if (skipTimer && e.isTrusted !== false) cancelAutoSkip(); }, true));
video.addEventListener('playing', () => { skipStreak5 = 0; cancelAutoSkip(); });

/* ---------- Gestos en el teléfono (reproductor web): doble toque y deslizar ---------- */
let tapT = 0, tapX = 0, swY = null, swX = null;
video.addEventListener('touchstart', e => { const t = e.touches[0]; swY = t.clientY; swX = t.clientX; }, { passive: true });
video.addEventListener('touchend', e => {
  const t = e.changedTouches[0], r = video.getBoundingClientRect();
  const it = S.current && S.current.items[S.current.index];
  // Deslizar arriba/abajo en el centro: cambiar de canal en vivo
  if (swY !== null && it && !isVod(it) && Math.abs(t.clientY - swY) > 80 && Math.abs(t.clientY - swY) > Math.abs(t.clientX - swX) * 1.5
      && t.clientX > r.left + r.width * 0.25 && t.clientX < r.right - r.width * 0.25 && S.current.items.length > 1){
    const up = t.clientY < swY; swY = null; step(up ? 1 : -1); return;
  }
  swY = null;
  const now = Date.now();
  if (now - tapT < 320 && Math.abs(t.clientX - tapX) < 80){
    tapT = 0;
    if (it && it.kind !== 'youtube'){ e.preventDefault(); seekBy(t.clientX < r.left + r.width / 2 ? -10 : 10); }
  } else { tapT = now; tapX = t.clientX; }
}, { passive: false });

/* ---------- Recordar el último canal enfocado en cada sección ---------- */
S.focusMem = {};
content.addEventListener('focusin', e => {
  const c = e.target.closest && e.target.closest('.card'); if (!c) return;
  S.focusMem[S.tab] = { i: [...content.querySelectorAll('.card')].indexOf(c) };
});
function restoreFocus(){
  const m = S.focusMem[S.tab]; if (!m || m.i < 0) return false;
  const c = content.querySelectorAll('.card')[m.i]; if (!c) return false;
  c.focus({ preventScroll: true }); c.scrollIntoView({ block: 'center' });
  return document.activeElement === c;
}

/* ---------- Atrás coherente: subir un nivel; en Inicio, confirmar antes de salir ---------- */
function backToHome(){
  if (S.q){ S.q = ''; $('#q').value = ''; hideSug(); render(); return true; }
  if (!android) return false;
  if (S.tab !== 'inicio'){ S.tab = 'inicio'; render(); window.scrollTo(0, 0); setTimeout(() => $('#tabs .active')?.focus({ preventScroll: true }), 60); return true; }
  const md = openModal(`<h3>¿Salir de MiTV?</h3><p class="muted">Puedes volver cuando quieras; tus favoritos y tu último canal quedan guardados.</p>
    <div class="actions"><button class="btn ghost" id="exNo" autofocus>Quedarme</button><button class="btn" id="exYes">Salir</button></div>`);
  md.querySelector('#exNo').onclick = () => closeModal();
  md.querySelector('#exYes').onclick = () => { closeModal(); if (android.exitApp) android.exitApp(); };
  setTimeout(() => md.querySelector('#exNo').focus(), 30);
  return true;
}

/* ---------- Búsqueda con sugerencias mientras escribes ---------- */
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function searchPool(){
  const seen = new Set(), out = [];
  const add = it => { if (!it || !it.url || seen.has(it.url)) return; seen.add(it.url); out.push(it); };
  P.favs.forEach(add); P.recents.forEach(add);
  (S.visible || []).forEach(add);
  Object.keys(S.cache).forEach(k => (S.cache[k] || []).forEach(add));
  S.movies.forEach(add);
  return out;
}
function hideSug(){ const b = $('#qSug'); if (b) b.classList.remove('show'); }
function showSug(q){
  let box = $('#qSug');
  if (!box){ box = document.createElement('div'); box.id = 'qSug'; $('.search').appendChild(box); }
  const n = norm(q).trim();
  if (n.length < 2){ hideSug(); return; }
  const words = n.split(/\s+/);
  const pool = searchPool();
  const scored = pool.map(it => {
    const name = norm(it.title || it.name);
    if (!words.every(w => (name + ' ' + norm(it.group)).includes(w))) return null;
    let s = name.startsWith(n) ? 3 : name.includes(n) ? 2 : 1;
    if (isFav(it.url)) s += 2;
    if (P.stats.ch[it.url]) s += 1;
    return [s, it];
  }).filter(Boolean).sort((a, b) => b[0] - a[0]).slice(0, 8).map(x => x[1]);
  if (!scored.length){ box.innerHTML = `<div class="muted" style="padding:10px 12px">Sin coincidencias rápidas. Presiona Enter para buscar en esta sección.</div>`; box.classList.add('show'); box._items = []; return; }
  box._items = scored;
  box.innerHTML = scored.map((it, i) => `<button class="sug" data-s="${i}"><span class="chl-l">${it.logo || it.poster ? `<img src="${esc(it.logo || it.poster)}" alt="" onerror="this.remove()">` : ''}</span>
    <span><b>${esc(it.title || it.name)}</b><small>${esc(isVod(it) ? 'Película o video' : it.kind === 'radio' ? 'Radio' : (it.group || '').split(';').map(g => catName(g.trim())).join(' · ') || 'Canal')}${isFav(it.url) ? ' · ★' : ''}</small></span></button>`).join('');
  box.classList.add('show');
  box.onclick = e => {
    const b = e.target.closest('[data-s]'); if (!b) return;
    const it = box._items[+b.dataset.s]; hideSug();
    if (isVod(it)) openDetail([it], 0); else play([it], 0);
  };
}

/* ---------- Modo noche y apagado automático ---------- */
function applyNight(){
  const m = S.cfg.night || 'off', h = new Date().getHours();
  document.documentElement.classList.toggle('night', m === 'on' || (m === 'auto' && (h >= 20 || h < 6)));
}
function setSleep(min){
  S.sleepAt = min ? Date.now() + min * 60e3 : 0;
  toast(min ? `🌙 MiTV se apagará en ${min} minutos` : 'Apagado automático cancelado');
  updateSleepLabel();
}
function updateSleepLabel(){
  const el = $('#sleepStat'); if (!el) return;
  el.textContent = S.sleepAt ? 'Se apaga a las ' + fmtTime(new Date(S.sleepAt)) : 'Desactivado';
}
function sleepMenu(){
  openMenu([15, 30, 60, 90, 120].map(m => ({ label: `🌙 Apagar en ${m} minutos`, on: false, fn: () => setSleep(m) }))
    .concat(S.sleepAt ? [{ label: 'Cancelar apagado (' + fmtTime(new Date(S.sleepAt)) + ')', fn: () => setSleep(0) }] : []));
}
function sleepNow(){
  S.sleepAt = 0;
  if (player.classList.contains('open')) closePlayer();
  stopPlayback();
  $('#dim').style.display = 'block';
  logEvent('noche', 'Apagado automático');
}
function checkSleep(){ if (S.sleepAt && Date.now() >= S.sleepAt) sleepNow(); applyNight(); }

/* ---------- Guía de primer uso ---------- */
function showGuide(){
  const touch = !IS_TV && matchMedia('(hover: none)').matches;
  const pages = IS_TV ? [
    ['📺 Bienvenido a MiTV', 'Usa las flechas del control para moverte y OK para elegir. El menú de secciones está a la izquierda.'],
    ['🎛️ Viendo un canal', '▲ ▼ cambian de canal · ◀ ▶ atrasan o adelantan · OK abre la lista de canales (mantén OK para marcar favorito) · los números van directo a un canal.'],
    ['↩️ Volver', 'Atrás cierra la lista, luego el video, luego te lleva a Inicio. Desde Inicio te pregunta antes de salir de la app.']
  ] : touch ? [
    ['📺 Bienvenido a MiTV', 'Toca un canal para verlo. Tus favoritos y lo último que viste aparecen en Inicio.'],
    ['👆 Gestos en el video', 'Toca para ver los botones · desliza arriba o abajo para cambiar de canal · doble toque a un lado para atrasar o adelantar 10 s · en la app de Android, desliza en el borde izquierdo para el brillo y en el derecho para el volumen.'],
    ['☰ Lista de canales', 'Con el botón Canales ves todos los canales por categoría, qué están dando y qué sigue. Toca ☆ para marcarlo como favorito.']
  ] : [
    ['📺 Bienvenido a MiTV', 'Haz clic en un canal para verlo. Escribe en el buscador para ver sugerencias al instante.'],
    ['⌨️ Atajos', '↑ ↓ cambian de canal · ← → atrasan o adelantan · L vuelve al canal anterior · números van directo a un canal · Esc cierra.'],
    ['☰ Lista de canales', 'En el reproductor, “Canales” muestra la lista por categoría con lo que están dando ahora y lo que sigue.']
  ];
  let p = 0;
  const md = openModal('<div id="gd"></div>');
  const draw = () => {
    md.querySelector('#gd').innerHTML = `<h3>${esc(pages[p][0])}</h3><p style="font-size:18px;line-height:1.5">${esc(pages[p][1])}</p>
      <div class="gdots">${pages.map((_, i) => `<i class="${i === p ? 'on' : ''}"></i>`).join('')}</div>
      <div class="actions">${p ? '<button class="btn ghost" id="gdB">Atrás</button>' : '<button class="btn ghost" id="gdS">Saltar</button>'}
      <button class="btn" id="gdN">${p < pages.length - 1 ? 'Siguiente' : 'Empezar'}</button></div>`;
    md.querySelector('#gdN').onclick = () => { if (p < pages.length - 1){ p++; draw(); } else { closeModal(); store.set('guided', true); } };
    const b = md.querySelector('#gdB'); if (b) b.onclick = () => { p--; draw(); };
    const s = md.querySelector('#gdS'); if (s) s.onclick = () => { closeModal(); store.set('guided', true); };
    md.querySelector('#gdN').focus();
  };
  draw();
}

/* ---------- Inicio: lo que más ves en este perfil ---------- */
function mostWatched(){
  const st = P.stats.ch;
  return Object.entries(st).filter(([u, c]) => c.s >= 120 && c.k !== 'radio' && !P.hidden.some(h => h.url === u))
    .sort((a, b) => b[1].s - a[1].s).slice(0, 12)
    .map(([url, c]) => ({ name: c.n, url, logo: c.logo, group: c.c, kind: c.k || '' }));
}

/* ---------- Ajustes de esta versión ---------- */
function ajustesExtra5(target){
  if (!target) return;
  target.innerHTML = `<div class="box"><h3>🧭 Navegación y uso</h3>
    ${IS_TV ? `<label class="switch"><input type="checkbox" id="sideNv" ${S.cfg.sideNav !== false ? 'checked' : ''}> Menú de secciones a la izquierda (como Google TV)</label>` : ''}
    <label class="switch"><input type="checkbox" id="autoSk" ${S.cfg.autoSkip !== false ? 'checked' : ''}> Si un canal no responde, pasar solo al siguiente (con 6 segundos para cancelar)</label>
    <div class="row"><div class="field" style="max-width:260px"><label>Modo noche</label><select id="nightS">${[['off', 'Apagado'], ['on', 'Siempre'], ['auto', 'Automático de 8 p. m. a 6 a. m.']].map(([v, n]) => `<option value="${v}" ${(S.cfg.night || 'off') === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    <div class="field" style="max-width:260px"><label>Apagado automático</label><select id="sleepS"><option value="">Elegir…</option>${[15, 30, 60, 90, 120].map(m => `<option value="${m}">En ${m} minutos</option>`).join('')}<option value="0">Cancelar</option></select></div></div>
    <p class="muted" style="margin:0 0 10px;font-size:13px">Modo noche baja el brillo de los menús. Apagado automático: <b id="sleepStat"></b>. También lo encuentras en el reproductor, en “Más ⋯”.</p>
    <button class="btn ghost" id="guideBtn">❓ ¿Cómo se usa MiTV?</button></div>`;
  const sn = $('#sideNv'); if (sn) sn.onchange = e => { S.cfg.sideNav = e.target.checked; saveCfg(); applySideNav(); };
  $('#autoSk').onchange = e => { S.cfg.autoSkip = e.target.checked; saveCfg(); };
  $('#nightS').onchange = e => { S.cfg.night = e.target.value; saveCfg(); applyNight(); };
  $('#sleepS').onchange = e => { if (e.target.value !== '') setSleep(+e.target.value); e.target.value = ''; };
  $('#guideBtn').onclick = showGuide;
  updateSleepLabel();
  ajustesExtra6(target);
  ajustesExtra7(target);
}

/* ---------- Menú lateral en TV ---------- */
const TAB_ICO = { inicio: '🏠', vivo: '📺', guia: '📅', deportes: '⚽', peliculas: '🎬', radio: '📻', plus: '➕', multi: '🔲', favoritos: '⭐', ajustes: '⚙️' };
function applySideNav(){
  document.querySelectorAll('#tabs button').forEach(b => { b.dataset.ico = TAB_ICO[b.dataset.tab] || '•'; });
  document.documentElement.classList.toggle('sidenav', IS_TV && S.cfg.sideNav !== false);
}

/* ---------- Arranque ---------- */
function startup5(){
  applySideNav();
  // Con mouse o toque el menú lateral no se despliega encima del contenido
  document.addEventListener('pointermove', () => document.documentElement.classList.add('mouse'), { passive: true });
  document.addEventListener('keydown', () => document.documentElement.classList.remove('mouse'), true);
  applyNight();
  setInterval(checkSleep, 20000);
  // Sugerencias del buscador
  const q = $('#q');
  q.addEventListener('input', e => showSug(e.target.value));
  q.addEventListener('focus', e => { if (e.target.value) showSug(e.target.value); });
  q.addEventListener('keydown', e => { if (e.key === 'Enter'){ hideSug(); clearTimeout(qTimer); S.q = q.value; render(); } if (e.key === 'Escape') hideSug(); });
  document.addEventListener('pointerdown', e => { if (!e.target.closest('.search')) hideSug(); });
  document.addEventListener('focusin', e => { if (!e.target.closest('.search')) hideSug(); });
  q.placeholder = voiceAvailable() ? 'Buscar canal o película… (o usa 🎤)' : 'Buscar canal o película…';
  // Arranque más rápido: preparar la lista del país en segundo plano
  const idle = window.requestIdleCallback || (f => setTimeout(f, 1200));
  idle(() => { countryItems(S.country === 'spa' ? 'spa' : S.country).catch(() => {}); });
  // Guía de primer uso
  // (3.10: la bienvenida y la guía de primer uso se lanzan desde startup7)
}
