/* =====================================================================
   MiTV 3.5 · Informe de errores y rendimiento
   ===================================================================== */
const LOG_MAX = 80;
const T0 = performance.now();
const perf = { start: 0, nav: [] };
function logEvent(type, msg){
  try {
    const l = store.get('log', []);
    l.push({ t: Date.now(), type, msg: String(msg).slice(0, 300) });
    while (l.length > LOG_MAX) l.shift();
    store.set('log', l);
  } catch(e){}
}
window.addEventListener('error', e => logEvent('error', (e.message || 'Error') + (e.filename ? ' @' + e.filename.split('/').pop() + ':' + e.lineno : '')));
window.addEventListener('unhandledrejection', e => logEvent('promesa', (e.reason && (e.reason.message || e.reason)) || 'rechazo'));
// Medir cuánto tarda cada flechazo (para saber si la navegación se siente lenta)
let navT = 0;
window.addEventListener('keydown', e => { if (e.key && e.key.startsWith('Arrow')) navT = performance.now(); }, true);
function supportReport(){
  const nav = perf.nav.length ? (perf.nav.reduce((a, b) => a + b, 0) / perf.nav.length).toFixed(1) : '—';
  const navMax = perf.nav.length ? Math.max(...perf.nav).toFixed(1) : '—';
  const mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) + ' MB' : '—';
  const log = store.get('log', []);
  const ch = Object.values(S.health);
  return [
    `MiTV ${APP_VERSION} · ${deviceName()} · ${IS_TV ? 'modo TV' : 'normal'}${android ? ' · app Android' : ''}`,
    `Fecha: ${new Date().toLocaleString('es-CR')}`,
    `Pantalla: ${innerWidth}×${innerHeight} · ${navigator.userAgent}`,
    `Arranque: ${perf.start ? Math.round(perf.start) + ' ms' : '—'} · Flechazo promedio: ${nav} ms (máx ${navMax} ms) · Memoria: ${mem}`,
    `Conexión: ${navigator.onLine === false ? 'sin internet' : 'con internet'} · Canales revisados: ${ch.length} (${ch.filter(h => h.ok).length} funcionan)`,
    `Reproductor: ${canNative() ? 'nativo de Android' : 'web'}`,
    '',
    `Últimos eventos (${log.length}):`,
    ...log.slice(-40).reverse().map(l => `${new Date(l.t).toLocaleString('es-CR')} [${l.type}] ${l.msg}`)
  ].join('\n');
}

/* =====================================================================
   Sin conexión
   ===================================================================== */
function netStatus(){
  const off = navigator.onLine === false;
  const bar = $('#netBar');
  bar.textContent = off ? '📡 Sin conexión a internet. Se muestran tus listas guardadas, favoritos y películas locales.' : '';
  bar.classList.toggle('show', off);
  if (!off && netStatus.was) { toast('Conexión recuperada'); if (!player.classList.contains('open') && !modals.length) render(); }
  netStatus.was = off;
}
addEventListener('online', netStatus);
addEventListener('offline', () => { netStatus(); logEvent('red', 'Se perdió la conexión'); });

/* =====================================================================
   Reproductor nativo de Android (ExoPlayer)
   ===================================================================== */
const canNative = () => !!(android && android.playNative && S.cfg.nativePlayer !== false);
const nativeOk = it => !isVod(it) && it.kind !== 'youtube' && it.kind !== 'radio' && !it.local && /^https?:/i.test(playUrl(it));
function playNative(items, index){
  const live = items.filter(nativeOk);
  const start = Math.max(0, live.indexOf(items[index]));
  S.nativeCtx = { items: live };
  const list = live.map((it, i) => ({ name: it.name, url: playUrl(it), alts: (it.alts || []).filter(u => u !== playUrl(it)).concat(playUrl(it) !== it.url ? [it.url] : []), ref: it.ref || '', ua: it.ua || '', num: i + 1, now: (nowNext(it) && nowNext(it).now) ? nowNext(it).now.title : '', ...nativeExtra(it) }));
  try { android.playNative(JSON.stringify({ items: list, index: start, autoSkip: S.cfg.autoSkip !== false, sleepAt: S.sleepAt || 0 })); logEvent('nativo', 'Abre ' + items[index].name); }
  catch(e){ logEvent('nativo', 'No se pudo abrir: ' + e.message); return false; }
  return true;
}
// La app Android avisa qué se vio al cerrar el reproductor nativo
window.mitvNativeEvent = json => {
  try {
    const d = JSON.parse(json); const ctx = S.nativeCtx; if (!ctx) return;
    (d.watched || []).forEach(w => { const it = ctx.items[w.i]; if (it && w.secs > 0) addStat(it, w.secs); });
    (d.failed || []).forEach(i => { const it = ctx.items[i]; if (it){ S.health[hk(it)] = { ok: false, why: 'down', t: Date.now() }; logEvent('canal', 'Falló en nativo: ' + it.name); } });
    store.set('health', S.health);
    (d.favs || []).forEach(f => setFav(ctx.items[f.i], !!f.on));
    if (d.slept) sleepNow();
    const last = ctx.items[d.index];
    if (last){
      trackLive(ctx.items, d.index);
      P.recents = [snap(last), ...P.recents.filter(r => r.url !== last.url)].slice(0, 18); pstore.set('recents', P.recents);
    }
    if (!modals.length) render();
  } catch(e){ logEvent('nativo', e.message); }
};

/* =====================================================================
   Banner del canal (como en el cable) y lista de canales
   ===================================================================== */
let osdTimer = null;
function afterPlay(it, items, index){
  if (isVod(it) || it.kind === 'youtube') return;
  const nn = nowNext(it);
  const o = $('#osd');
  o.innerHTML = `<div class="osd-num">${index + 1}</div>
    <div class="osd-logo">${it.logo ? `<img src="${esc(it.logo)}" alt="" onerror="this.remove()">` : ''}</div>
    <div class="osd-txt"><b>${esc(it.name)}</b>
      ${nn && nn.now ? `<span>Ahora: ${esc(nn.now.title)} · hasta ${fmtTime(new Date(nn.now.stop))}</span><div class="osd-prog"><i style="width:${Math.max(2, Math.min(100, (Date.now() - nn.now.start) / Math.max(1, nn.now.stop - nn.now.start) * 100)).toFixed(0)}%"></i></div>` : `<span>${esc((it.group || '').split(';').map(g => catName(g.trim())).join(' · '))}</span>`}
      ${nn && nn.next ? `<small>Sigue: ${esc(nn.next.title)}</small>` : ''}</div>`;
  o.classList.add('show');
  clearTimeout(osdTimer); osdTimer = setTimeout(() => o.classList.remove('show'), 5000);
}
function chListOpen(){ return $('#chList').classList.contains('show'); }
// openChannelList: ver features5.js (categorías, favoritos y vista previa)
function closeChannelList(){ $('#chList').classList.remove('show'); if (IS_TV && document.activeElement && $('#chList').contains(document.activeElement)) video.focus({ preventScroll: true }); }

/* =====================================================================
   Solo audio
   ===================================================================== */
function toggleAudioOnly(){
  const it = S.current && S.current.items[S.current.index]; if (!it) return;
  const on = !player.classList.contains('audioonly');
  player.classList.toggle('audioonly', on);
  if (on){
    showAudioUI(Object.assign({}, it, { kind: 'radio', group: 'Solo audio · ahorra datos' }));
    if (hls && hls.levels.length > 1){ hls.currentLevel = 0; }
    toast('🎧 Solo audio: la imagen se apaga y se usa la calidad más baja');
  } else {
    hideAudioUI();
    if (hls) hls.currentLevel = -1;
    toast('Imagen activada');
  }
}

/* =====================================================================
   Clima (Open-Meteo, gratis y sin clave) y tráfico (mapa en vivo de Waze)
   ===================================================================== */
const CITIES = [
  ['San José', 9.9281, -84.0907], ['Alajuela', 10.0163, -84.2116], ['Cartago', 9.8644, -83.9194], ['Heredia', 9.998, -84.1165],
  ['Liberia', 10.6346, -85.4377], ['Puntarenas', 9.9763, -84.8384], ['Limón', 9.9907, -83.0359], ['Pérez Zeledón', 9.3735, -83.7044],
  ['San Carlos', 10.3238, -84.4271], ['Nicoya', 10.1483, -85.452], ['Turrialba', 9.9047, -83.6838], ['Golfito', 8.6394, -83.1814]
];
const WMO = { 0: ['Despejado', '☀️'], 1: ['Mayormente despejado', '🌤️'], 2: ['Parcialmente nublado', '⛅'], 3: ['Nublado', '☁️'], 45: ['Neblina', '🌫️'], 48: ['Neblina', '🌫️'],
  51: ['Llovizna', '🌦️'], 53: ['Llovizna', '🌦️'], 55: ['Llovizna fuerte', '🌧️'], 61: ['Lluvia débil', '🌦️'], 63: ['Lluvia', '🌧️'], 65: ['Lluvia fuerte', '🌧️'],
  80: ['Aguaceros', '🌦️'], 81: ['Aguaceros', '🌧️'], 82: ['Aguaceros fuertes', '⛈️'], 95: ['Tormenta', '⛈️'], 96: ['Tormenta con granizo', '⛈️'], 99: ['Tormenta con granizo', '⛈️'] };
const city = () => CITIES.find(c => c[0] === S.cfg.city) || CITIES[0];
async function weather(){
  const c = city(), ck = 'wx:' + c[0];
  const cached = store.get(ck, null);
  if (cached && Date.now() - cached.t < 30*60e3) return cached.v;
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${c[1]}&longitude=${c[2]}&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  const code = j.current.weather_code, w = WMO[code] || ['', '🌡️'];
  const v = { temp: Math.round(j.current.temperature_2m), text: w[0], icon: code <= 1 && !j.current.is_day ? '🌙' : w[1],
    max: Math.round(j.daily.temperature_2m_max[0]), min: Math.round(j.daily.temperature_2m_min[0]), rain: j.daily.precipitation_probability_max ? j.daily.precipitation_probability_max[0] : null, city: c[0] };
  store.set(ck, { t: Date.now(), v });
  return v;
}
function weatherHTML(v){
  return `<span class="wx-ico">${v.icon}</span><b>${v.temp}°</b><span>${esc(v.city)} · ${esc(v.text)}<small>Máx ${v.max}° · Mín ${v.min}°${v.rain !== null ? ' · Lluvia ' + v.rain + '%' : ''}</small></span>`;
}
function openTraffic(){
  const c = city();
  const md = openModal(`<h3>🚗 Tráfico en vivo · ${esc(c[0])}</h3>
    <div class="traffic"><iframe src="https://embed.waze.com/iframe?zoom=13&lat=${c[1]}&lon=${c[2]}&ct=livemap" allowfullscreen title="Mapa de tráfico"></iframe></div>
    <p class="muted" style="font-size:12px;margin:8px 0 0">Mapa en vivo de Waze. Cambia la ciudad en Ajustes → Clima y protector de pantalla.</p>
    <div class="actions"><button class="btn" id="trNo" autofocus>Cerrar</button></div>`);
  md.classList.add('wide');
  md.querySelector('#trNo').onclick = () => closeModal();
}

/* =====================================================================
   Protector de pantalla
   ===================================================================== */
let lastActivity = Date.now(), saverTimer = null;
function activity(){ lastActivity = Date.now(); }
['keydown', 'mousemove', 'touchstart', 'click'].forEach(ev => addEventListener(ev, activity, { capture: true, passive: true }));
function saverOn(){ return $('#saver').classList.contains('show'); }
function showSaver(){
  const s = $('#saver');
  s.classList.add('show');
  const draw = async () => {
    const d = new Date();
    let wx = '';
    try { const v = await weather(); wx = `<div class="sv-wx">${v.icon} ${v.temp}° · ${esc(v.city)} · ${esc(v.text)}</div>`; } catch(e){}
    if (!saverOn()) return;
    s.innerHTML = `<div class="sv-box" style="left:${10 + Math.random() * 45}%;top:${10 + Math.random() * 45}%">
      <div class="sv-time">${d.toLocaleTimeString('es-CR', { hour: 'numeric', minute: '2-digit' })}</div>
      <div class="sv-date">${d.toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>${wx}
      <div class="sv-logo">Mi<span>TV</span></div></div>`;
  };
  draw();
  clearInterval(saverTimer); saverTimer = setInterval(draw, 30000);
}
function hideSaver(){ $('#saver').classList.remove('show'); clearInterval(saverTimer); }
// Cualquier tecla o toque quita el protector sin hacer nada más
addEventListener('keydown', e => { if (saverOn()){ e.preventDefault(); e.stopImmediatePropagation(); hideSaver(); } }, true);
addEventListener('click', e => { if (saverOn()){ e.preventDefault(); e.stopImmediatePropagation(); hideSaver(); } }, true);
function checkSaver(){
  const min = +S.cfg.saverMin;
  if (!min || saverOn()) return;
  const watching = player.classList.contains('open') && !video.paused && !player.classList.contains('audioonly');
  if (watching || mvPlayers.some(Boolean)) return;
  if (Date.now() - lastActivity > min * 60e3) showSaver();
}

/* =====================================================================
   Favoritos de la familia (los ven todos los perfiles)
   ===================================================================== */
const famFavs = () => store.get('familyFavs', []);
const isFam = url => famFavs().some(f => f.url === url);
function toggleFam(it){
  let l = famFavs();
  if (isFam(it.url)) l = l.filter(f => f.url !== it.url); else l.push(snap(it));
  store.set('familyFavs', l);
  toast(isFam(it.url) ? '👪 Agregado a favoritos de la familia' : 'Quitado de favoritos de la familia');
}

/* =====================================================================
   Pestaña PLUS
   ===================================================================== */
const NATIONAL = /(teletica|canal ?(2|4|6|7|8|9|11|13)\b|repretel|multimedios|futv|tigo|cdr)/i;
const INTL_NEWS = /\b(dw|rtve|24h|france ?24|cgtn|euronews|telesur|rt\b|cnn|nhk|tv5|voa|bbc|al ?jazeera|ntn24|cnn en español|vtv|europa press)/i;
function viewPlus(){
  side.style.display = 'none';
  const fam = famFavs();
  content.innerHTML = `<h2>✨ PLUS</h2><p class="sub">Lo mejor de las fuentes públicas y oficiales, reunido en un solo lugar.</p>
    ${fam.length ? '<div class="section-title"><h3>👪 Favoritos de la familia</h3></div><div id="pFam"></div>' : ''}
    <div class="section-title"><h3>📍 Canales regionales de Costa Rica</h3></div><div id="pReg"><div class="loading">Cargando…</div></div>
    <div class="section-title"><h3>▶️ Costa Rica en YouTube</h3></div><div id="pYtR"></div>
    <div class="section-title"><h3>🌎 Noticias internacionales gratis</h3></div><div id="pNews"><div class="loading">Cargando…</div></div>
    ${profile().kids ? '' : '<div class="section-title"><h3>📱 Apps oficiales</h3></div><div id="pApps"></div>'}`;
  if (fam.length) renderGrid($('#pFam'), fam, '', { live: false, row: true });
  renderGrid($('#pYtR'), [...officialYt('cr'), ...ytItems()], 'Agrega canales de YouTube en Ajustes.', { live: false, row: true });
  if ($('#pApps')) renderApps($('#pApps'));
  countryItems('cr').then(l => { if (S.tab === 'plus' && $('#pReg')) renderGrid($('#pReg'), l.filter(i => i.kind !== 'youtube' && !NATIONAL.test(i.name)), 'No hay canales regionales disponibles.', { live: false, row: true }); })
    .catch(() => { if ($('#pReg')) $('#pReg').innerHTML = '<div class="empty">No se pudo cargar.</div>'; });
  loadRemote(countryUrl('spa')).then(l => {
    if (S.tab !== 'plus' || !$('#pNews')) return;
    const news = l.filter(i => hasCat(i, 'news'));
    const intl = news.filter(i => INTL_NEWS.test(i.name));
    renderGrid($('#pNews'), (intl.length >= 6 ? intl : [...intl, ...news.filter(i => !intl.includes(i))]).slice(0, 30), 'No se encontraron canales de noticias.', { live: false, row: true });
  }).catch(() => { if ($('#pNews')) $('#pNews').innerHTML = '<div class="empty">No se pudo cargar.</div>'; });
}

/* =====================================================================
   Resúmenes de partidos
   ===================================================================== */
const highlightsUrl = e => 'https://www.youtube.com/results?search_query=' + encodeURIComponent(`resumen ${e.home.name} vs ${e.away.name}`);
function openExternalUrl(u){
  const l = document.createElement('a'); l.href = u; l.target = '_blank'; l.rel = 'noopener';
  document.body.appendChild(l); l.click(); l.remove();
}

/* =====================================================================
   Ajustes de la versión 3.5
   ===================================================================== */
function ajustesExtra4(target){
  target.innerHTML = `
  ${android && android.playNative ? `<div class="box"><h3>Reproductor de Android</h3>
    <label class="switch"><input type="checkbox" id="natP" ${S.cfg.nativePlayer !== false ? 'checked' : ''}> Usar el reproductor nativo de Android para canales en vivo (más fluido, recomendado en TV)</label>
    <p class="muted" style="margin:0;font-size:13px">En el reproductor nativo: ▲▼ cambian de canal, ◀▶ atrasan o adelantan, OK o Menú abren la lista de canales (◀▶ cambian de categoría, mantener OK marca favorito), el botón Último vuelve al canal anterior, los números cambian de canal y Atrás vuelve a MiTV. En el teléfono: toca la pantalla para ver los botones, desliza arriba o abajo en el centro para cambiar de canal, en el borde izquierdo para el brillo y en el derecho para el volumen, doble toque para atrasar o adelantar y desliza a la izquierda para abrir la lista. Al salir de la app, el canal sigue en una ventana flotante.</p></div>` : ''}
  <div class="box"><h3>Clima y protector de pantalla</h3>
    <div class="row"><div class="field" style="max-width:240px"><label>Ciudad</label><select id="cityS">${CITIES.map(c => `<option ${c[0] === city()[0] ? 'selected' : ''}>${esc(c[0])}</option>`).join('')}</select></div>
    <div class="field" style="max-width:240px"><label>Protector de pantalla</label><select id="saverS">${[['0', 'Apagado'], ['2', 'A los 2 minutos'], ['5', 'A los 5 minutos'], ['10', 'A los 10 minutos'], ['15', 'A los 15 minutos']].map(([v, n]) => `<option value="${v}" ${String(S.cfg.saverMin) === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div></div>
    <p class="muted" style="margin:0;font-size:13px">El protector muestra la hora y el clima cuando la app está quieta y no estás viendo nada.</p></div>
  <div class="box"><h3>🧰 Informe para soporte</h3>
    <p class="muted" style="margin-top:0">Si algo falla o se siente lento, copia este informe y mándamelo: incluye los últimos errores y cuánto tarda la app en responder en este dispositivo.</p>
    <pre id="repPre" class="report"></pre>
    <div class="row"><button class="btn" id="repCopy">Copiar informe</button><button class="btn ghost" id="repClr">Borrar registro</button></div></div>
  <div id="aj5"></div>`;
  ajustesExtra5($('#aj5'));
  if ($('#natP')) $('#natP').onchange = e => { S.cfg.nativePlayer = e.target.checked; saveCfg(); };
  $('#cityS').onchange = e => { S.cfg.city = e.target.value; saveCfg(); toast('Ciudad: ' + e.target.value); };
  $('#saverS').onchange = e => { S.cfg.saverMin = +e.target.value; saveCfg(); };
  const rep = supportReport();
  $('#repPre').textContent = rep.split('\n').slice(0, 14).join('\n') + (rep.split('\n').length > 14 ? '\n…' : '');
  $('#repCopy').onclick = async () => {
    try { await navigator.clipboard.writeText(supportReport()); toast('Informe copiado'); }
    catch(e){ const md = openModal(`<h3>Informe para soporte</h3><textarea readonly style="width:100%;height:50vh;font-size:11px">${esc(supportReport())}</textarea><div class="actions"><button class="btn" id="rpNo" autofocus>Cerrar</button></div>`); md.querySelector('#rpNo').onclick = () => closeModal(); }
  };
  $('#repClr').onclick = () => { store.set('log', []); toast('Registro borrado'); render(); };
}

/* =====================================================================
   Arranque
   ===================================================================== */
function startup4(){
  // Medición del tiempo de cada flechazo (se registra después de que la app lo atendió)
  document.addEventListener('keydown', e => { if (navT && e.key && e.key.startsWith('Arrow')){ perf.nav.push(performance.now() - navT); if (perf.nav.length > 200) perf.nav.shift(); navT = 0; } });
  perf.start = performance.now() - T0;
  netStatus();
  setInterval(checkSaver, 20000);
  $('#pChl').onclick = openChannelList;
  if (S.cfg.saverMin === undefined){ S.cfg.saverMin = IS_TV ? 10 : 0; saveCfg(); }
  if (IS_TV && S.cfg.nativePlayer === undefined && android && android.playNative){ S.cfg.nativePlayer = true; saveCfg(); }
}
