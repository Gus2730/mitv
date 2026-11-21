/* =====================================================================
   MiTV 3.9 · Experiencia premium
   ===================================================================== */

/* ---------- Efectos visuales: completos o ligeros (la TV usa ligeros por defecto) ---------- */
const fxMode = () => S.cfg.fx || (IS_TV || LITE ? 'lite' : 'full');
function applyFx(){ document.documentElement.classList.toggle('fxfull', fxMode() === 'full'); }

/* Transición suave al cambiar de sección */
const render6 = render;
render = function(){
  const r = render6.apply(this, arguments);
  try { content.classList.remove('vin'); void content.offsetWidth; content.classList.add('vin'); } catch(e){}
  return r;
};

/* ---------- Sonidos discretos de navegación (TV) ---------- */
let audioCtx = null;
const soundsOn = () => S.cfg.sounds !== undefined ? !!S.cfg.sounds : IS_TV;
function beep(freq, dur, vol){
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = audioCtx.currentTime;
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t + dur + 0.02);
  } catch(e){}
}
document.addEventListener('keydown', e => {
  if (!soundsOn() || e.repeat || player.classList.contains('open')) return;
  if (e.key.startsWith('Arrow')) beep(540, 0.05, 0.035);
  else if (e.key === 'Enter') beep(820, 0.09, 0.05);
  else if (e.key === 'Escape' || e.key === 'Backspace') beep(330, 0.09, 0.04);
}, true);

/* ---------- Insignias del reproductor: EN VIVO, calidad y estabilidad de la señal ---------- */
let stalls = [];
video.addEventListener('waiting', () => { stalls.push(Date.now()); });
function updBadge(){
  if (!player.classList.contains('open')) return;
  let t = $('#pBadge');
  if (!t){ t = document.createElement('div'); t.id = 'pBadge'; $('#pSub').insertAdjacentElement('afterend', t); }
  const it = S.current && S.current.items[S.current.index];
  if (!it){ t.innerHTML = ''; return; }
  const live = !isVod(it) && it.kind !== 'youtube' && it.kind !== 'radio' && it.kind !== 'podcast';
  stalls = stalls.filter(x => Date.now() - x < 60000);
  const q = !stalls.length ? ['good', 'Señal estable'] : stalls.length < 3 ? ['mid', 'Señal regular'] : ['bad', 'Conexión inestable'];
  const h = video.videoHeight;
  t.innerHTML = (live ? '<span class="bd live">● EN VIVO</span>' : '') +
    (h && it.kind !== 'youtube' ? `<span class="bd">${h >= 2160 ? '4K' : h >= 1080 ? '1080p' : h >= 720 ? '720p' : h + 'p'}</span>` : '') +
    (live && h && !video.paused ? `<span class="bd ${q[0]}">${q[1]}</span>` : '');
}
['playing', 'resize', 'loadedmetadata', 'pause'].forEach(ev => video.addEventListener(ev, updBadge));
setInterval(updBadge, 3000);

/* ---------- Tu resumen MiTV ---------- */
function openSummary(){
  const st = P.stats, ym = todayKey().slice(0, 7);
  const monthDays = Object.entries(st.day).filter(([d]) => d.startsWith(ym));
  const secs = monthDays.reduce((a, [, s]) => a + s, 0);
  const active = monthDays.filter(([, s]) => s >= 60).length;
  // Racha: días seguidos con televisión, contando desde hoy (o ayer)
  let streak = 0; const d = new Date();
  if (!(st.day[d.toLocaleDateString('sv')] >= 60)) d.setDate(d.getDate() - 1);
  while (st.day[d.toLocaleDateString('sv')] >= 60){ streak++; d.setDate(d.getDate() - 1); }
  // Día de la semana más activo
  const wd = [0, 0, 0, 0, 0, 0, 0];
  Object.entries(st.day).forEach(([k, s]) => { wd[new Date(k + 'T12:00:00').getDay()] += s; });
  const names = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const best = Math.max(...wd), bestDay = best > 0 ? names[wd.indexOf(best)] : '—';
  const topCh = Object.entries(st.ch).sort((a, b) => b[1].s - a[1].s).slice(0, 5);
  const maxC = Math.max(1, ...topCh.map(c => c[1].s));
  const topCat = Object.entries(st.cat).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const maxK = Math.max(1, ...topCat.map(c => c[1]));
  const month = new Date().toLocaleDateString('es-CR', { month: 'long', year: 'numeric' });
  const md = openModal(`<h3>📊 Tu resumen MiTV</h3><p class="muted" style="margin-top:0">${esc(profile().name)} · ${esc(month)}</p>
    ${secs || topCh.length ? `<div class="sumgrid">
      <div class="sumcard"><b>${esc(fmtMins(secs))}</b><span>vistos este mes</span></div>
      <div class="sumcard"><b>${active}</b><span>${active === 1 ? 'día' : 'días'} con TV este mes</span></div>
      <div class="sumcard"><b>${streak}</b><span>${streak === 1 ? 'día' : 'días'} seguidos</span></div>
      <div class="sumcard"><b style="font-size:20px;text-transform:capitalize">${esc(bestDay)}</b><span>tu día más de TV</span></div></div>
      ${topCh[0] ? `<p>Tu canal número 1: <b style="color:var(--accent)">${esc(topCh[0][1].n)}</b></p>` : ''}
      ${topCh.length ? '<p class="muted" style="margin-bottom:4px">Lo más visto</p>' + topCh.map(([u, c]) => `<div class="hbar"><span>${esc(c.n)}</span><i style="width:${(c.s / maxC * 100).toFixed(0)}%"></i><small>${esc(fmtMins(c.s))}</small></div>`).join('') : ''}
      ${topCat.length ? '<p class="muted" style="margin-bottom:4px">Tus categorías</p>' + topCat.map(([c, s]) => `<div class="hbar"><span>${esc(catName(c))}</span><i style="width:${(s / maxK * 100).toFixed(0)}%"></i><small>${esc(fmtMins(s))}</small></div>`).join('') : ''}
      <p class="muted" style="font-size:12px">Los canales y categorías cubren lo guardado de los últimos 60 días de este perfil.</p>`
    : '<div class="empty">Todavía no hay datos. Mira algo de televisión y aquí aparecerá tu resumen.</div>'}
    <div class="actions"><button class="btn" id="sumNo" autofocus>Cerrar</button></div>`);
  md.querySelector('#sumNo').onclick = () => closeModal();
}

/* ---------- Tráiler de películas (TMDB + YouTube) ---------- */
async function trailerFor(it){
  const key = (S.cfg.tmdbKey || '').trim();
  if (!key){ toast('Agrega tu clave de TMDB en Ajustes para ver tráilers'); return; }
  const bearer = key.length > 40, g = titleGuess(it.name);
  const call = async path => {
    const u = `https://api.themoviedb.org/3/${path}${path.includes('?') ? '&' : '?'}${bearer ? '' : 'api_key=' + encodeURIComponent(key)}`;
    const r = await fetch(u, bearer ? { headers: { Authorization: 'Bearer ' + key } } : {});
    if (!r.ok) throw new Error('TMDB ' + r.status);
    return r.json();
  };
  toast('Buscando el tráiler…');
  try {
    const s = await call(`search/movie?language=es-MX&include_adult=false&query=${encodeURIComponent(g.title)}${g.year ? '&year=' + g.year : ''}`);
    const m = (s.results || [])[0];
    if (!m){ toast('No se encontró esta película en TMDB'); return; }
    let vids = [];
    for (const lang of ['es-MX', 'en-US']){
      const v = await call(`movie/${m.id}/videos?language=${lang}`);
      vids = (v.results || []).filter(x => x.site === 'YouTube' && /trailer|teaser/i.test(x.type));
      if (vids.length) break;
    }
    const pick = vids.find(x => x.type === 'Trailer') || vids[0];
    if (!pick){ toast('Esta película no tiene tráiler disponible'); return; }
    closeModal();
    play([{ name: (it.title || it.name) + ' · tráiler', url: 'yt:video:' + pick.key, kind: 'youtube', yt: { type: 'video', id: pick.key }, logo: it.poster || '', group: 'Tráiler' }], 0);
  } catch(e){ toast('No se pudo cargar el tráiler: ' + e.message); }
}

/* ---------- Enviar el canal a otro dispositivo (por ejemplo, del celular a la TV) ---------- */
async function sendToDevice(it){
  if (!it || it.local){ toast('Este contenido está solo en este dispositivo'); return; }
  if (!cloudReady()){ toast('Inicia sesión en la nube (Ajustes) en los dos dispositivos para enviar canales'); return; }
  let devs = {};
  try { devs = await fb('GET', `users/${cloud().uid}/devices`) || {}; } catch(e){ toast(e.message); return; }
  const list = Object.entries(devs).filter(([id]) => id !== devId).sort((a, b) => b[1].ts - a[1].ts);
  if (!list.length){ toast('No hay otros dispositivos con tu cuenta. Inicia sesión en tu TV con la misma cuenta.'); return; }
  const md = openModal(`<h3>📡 Enviar a la TV</h3><p class="muted" style="margin-top:0">${esc(it.title || it.name)}</p>
    ${list.map(([id, d]) => `<button class="btn ghost" data-t="${esc(id)}" style="display:block;width:100%;margin:6px 0;text-align:left">${esc(d.name)} <span class="muted">· visto ${fmtTime(new Date(d.ts))}</span></button>`).join('')}
    <div class="actions"><button class="btn ghost" id="sdNo">Cancelar</button></div>`);
  md.querySelector('#sdNo').onclick = () => closeModal();
  md.addEventListener('click', async e => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    try {
      await fb('POST', `users/${cloud().uid}/remote/${b.dataset.t}`, { k: 'playch', v: JSON.stringify(snap(it)), t: Date.now() });
      closeModal(); toast('Enviado a ' + b.textContent.split(' · ')[0].trim());
    } catch(err){ toast('No se pudo enviar: ' + err.message); }
  });
}
/* Transmitir a Chromecast u otra pantalla desde el navegador */
async function castScreen(){
  if (video.remote && typeof video.remote.prompt === 'function' && !video.disableRemotePlayback){
    try { await video.remote.prompt(); return; }
    catch(e){ if (e && e.name === 'NotAllowedError') return; }
  }
  openModal(`<h3>📺 Transmitir a la TV</h3>
    <p>Este navegador no puede enviar este canal directamente a la TV. Dos opciones:</p>
    <p>1. <b>Chrome o Edge:</b> menú ⋮ → <b>Guardar, compartir y transmitir</b> → <b>Transmitir…</b> y elige tu Chromecast o TV.</p>
    <p>2. <b>Con MiTV en tu TV:</b> inicia sesión con la misma cuenta en los dos aparatos y usa <b>Más ⋯ → Enviar a otro dispositivo</b>.</p>
    <div class="actions"><button class="btn" id="csNo" autofocus>Entendido</button></div>`).querySelector('#csNo').onclick = () => closeModal();
}

/* ---------- Widget de favoritos y canal pedido desde el widget (Android) ---------- */
let widSig = '';
function syncWidget(){
  if (!android || !android.setWidgetFavs) return;
  try {
    const favs = P.favs.filter(f => !isVod(f) && f.kind !== 'series' && f.url)
      .sort((a, b) => ((P.stats.ch[b.url] || {}).s || 0) - ((P.stats.ch[a.url] || {}).s || 0)).slice(0, 5)
      .map(f => ({ n: f.name, u: f.url }));
    const sig = JSON.stringify(favs);
    if (sig !== widSig){ widSig = sig; android.setWidgetFavs(sig); }
  } catch(e){}
}
window.mitvLaunchCheck = function(){
  if (!android || !android.takeLaunchChannel) return;
  const u = android.takeLaunchChannel(); if (!u) return;
  const it = P.favs.find(f => f.url === u);
  if (it) play([it], 0);
};
/* Avisos de la actualización dentro de la app */
window.mitvUpdateEvent = function(s){
  const m = {
    download: 'Descargando la actualización… al terminar, Android te pedirá confirmar la instalación.',
    install: 'Descarga lista. Acepta la instalación en la pantalla de Android.',
    perm: 'Activa “Permitir de esta fuente” para MiTV y vuelve a tocar Actualizar.',
    fail: 'No se pudo instalar automáticamente. Abriendo la descarga…'
  };
  toast(m[s] || s);
  if (s === 'fail' && window.__apk) setTimeout(() => { location.href = window.__apk; }, 1200);
};

/* ---------- Ajustes de esta versión ---------- */
function ajustesExtra6(target){
  if (!target) return;
  target.insertAdjacentHTML('beforeend', `<div class="box"><h3>✨ Apariencia y extras</h3>
    <div class="row"><div class="field" style="max-width:300px"><label>Efectos visuales</label><select id="fxS">
      <option value="full" ${fxMode() === 'full' ? 'selected' : ''}>Completos (animaciones y atenuado)</option>
      <option value="lite" ${fxMode() === 'lite' ? 'selected' : ''}>Ligeros (recomendado en TV)</option></select></div></div>
    <label class="switch"><input type="checkbox" id="sndS" ${soundsOn() ? 'checked' : ''}> Sonidos suaves al navegar con el control</label>
    <div class="row" style="margin-top:8px"><button class="btn ghost" id="sumBtn">📊 Tu resumen MiTV</button>
    ${android && android.setWidgetFavs ? '<span class="muted" style="font-size:13px">Widget: mantén presionada la pantalla de inicio de tu celular → Widgets → MiTV.</span>' : ''}</div></div>`);
  $('#fxS').onchange = e => { S.cfg.fx = e.target.value; saveCfg(); applyFx(); };
  $('#sndS').onchange = e => { S.cfg.sounds = e.target.checked; saveCfg(); if (e.target.checked) beep(660, 0.1, 0.05); };
  $('#sumBtn').onclick = openSummary;
}

/* ---------- Arranque ---------- */
function startup6(){
  applyFx();
  syncWidget();
  setInterval(syncWidget, 20000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) syncWidget(); else window.mitvLaunchCheck(); });
  setTimeout(window.mitvLaunchCheck, 1800);
}

/* Ganchos para las pruebas automáticas */
window.mitvTest = { showUpdate, execRemote, soundsOn, closePlayer, applyFx };
