/* =====================================================================
   MiTV 3 · Versión, actualizaciones y pantalla de carga
   ===================================================================== */
const APP_VERSION = '3.14';
const BUILT_HOME = '__MITV_HOME__';
function homeUrl(){
  if (S.cfg.homeUrl) return S.cfg.homeUrl.replace(/\/?$/, '/');
  if (!BUILT_HOME.startsWith('__')) return BUILT_HOME.replace(/\/?$/, '/');
  if (/^https?:$/.test(location.protocol) && !/appassets/.test(location.hostname) && /\/app\/(index\.html)?$/.test(location.pathname)) return new URL('../', location.href).href;
  return '';
}
const verNum = v => String(v).split('.').map(n => parseInt(n, 10) || 0);
function newer(a, b){ const x = verNum(a), y = verNum(b); for (let i = 0; i < Math.max(x.length, y.length); i++){ if ((x[i]||0) !== (y[i]||0)) return (x[i]||0) > (y[i]||0); } return false; }
async function checkUpdates(manual){
  const home = homeUrl();
  if (!home){ if (manual) toast('Configura la dirección de tu página publicada para buscar actualizaciones'); return; }
  if (!manual && Date.now() - store.get('updChk', 0) < 6*3600e3) return;
  store.set('updChk', Date.now());
  try {
    const r = await fetch(home + 'version.json?t=' + Date.now(), { cache: 'no-store' });
    const v = await r.json();
    if (newer(v.version, APP_VERSION)) showUpdate(v, home);
    else if (manual) toast('Ya tienes la versión más reciente (' + APP_VERSION + ')');
  } catch(e){ if (manual) toast('No se pudo revisar: ' + e.message); }
}
function showUpdate(v, home){
  const bar = $('#updBar');
  const apk = v.apk ? new URL(v.apk, home).href : home + 'MiTV.apk';
  bar.innerHTML = `<span>Hay una versión nueva de MiTV (${esc(v.version)}).</span>` +
    (android ? `<button class="btn small" id="updGo">Actualizar ahora</button>`
      : navigator.serviceWorker && navigator.serviceWorker.controller ? `<button class="btn small" id="updGo">Actualizar ahora</button>`
      : `<a class="btn small" href="${esc(home)}" target="_blank" rel="noopener">Ver novedades</a>`) +
    `<button class="btn ghost small" id="updNo">Después</button>`;
  bar.classList.add('show');
  const go = $('#updGo');
  if (go) go.onclick = () => {
    if (android){ if (android.installUpdate){ window.__apk = apk; android.installUpdate(apk); } else location.href = apk; return; }
    navigator.serviceWorker.getRegistration().then(r => r && r.update()).finally(() => location.reload());
  };
  $('#updNo').onclick = () => bar.classList.remove('show');
}
function registerSW(){
  if (!window.isSecureContext || !/^https?:$/.test(location.protocol) || !('serviceWorker' in navigator) || android || !/\/app\/(index\.html)?$/.test(location.pathname)) return;
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
function hideSplash(){
  const s = $('#splash'); if (!s) return;
  s.classList.add('hide'); setTimeout(() => s.remove(), 500);
}

/* =====================================================================
   Estadísticas de uso y tiempo de pantalla
   ===================================================================== */
const todayKey = () => new Date().toLocaleDateString('sv');
function addStat(it, secs){
  const st = P.stats;
  const c = st.ch[it.url] || (st.ch[it.url] = { n: it.name, s: 0, c: it.group || '', logo: it.logo || '', k: it.kind || '' });
  c.s += secs; c.n = it.name;
  cats(it).forEach(x => { st.cat[x] = (st.cat[x] || 0) + secs; });
  const d = todayKey(); st.day[d] = (st.day[d] || 0) + secs;
  const days = Object.keys(st.day).sort(); if (days.length > 60) days.slice(0, days.length - 60).forEach(k => delete st.day[k]);
  const chs = Object.keys(st.ch); if (chs.length > 300) chs.sort((a, b) => st.ch[a].s - st.ch[b].s).slice(0, chs.length - 300).forEach(k => delete st.ch[k]);
  pstore.set('stats', st);
}
function todaySecs(){ return P.stats.day[todayKey()] || 0; }
async function checkTimeLimit(){
  const pr = profile();
  if (!pr.kids || !pr.limitMin) return true;
  if (todaySecs() < pr.limitMin * 60) return true;
  if (S.cfg.pin) return askPin(`Se acabó el tiempo de hoy (${pr.limitMin} min). PIN para seguir`);
  toast('Se acabó el tiempo de pantalla de hoy');
  return false;
}
let statTimer = null;
function startStats(it){
  clearInterval(statTimer);
  statTimer = setInterval(async () => {
    if (!player.classList.contains('open') || video.paused || !S.current) return;
    if (it.kind !== 'youtube' && video.readyState < 2) return;
    addStat(it, 10);
    const pr = profile();
    if (pr.kids && pr.limitMin && todaySecs() >= pr.limitMin * 60 && Date.now() > S.unlockedUntil){
      clearInterval(statTimer); closePlayer(); toast('Se acabó el tiempo de pantalla de hoy');
    }
  }, 10000);
}
function fmtMins(s){ const m = Math.round(s / 60); return m >= 60 ? `${Math.floor(m/60)} h ${m%60} min` : `${m} min`; }

/* =====================================================================
   Último canal y canal anterior
   ===================================================================== */
const snap = it => ({ name: it.name, url: it.url, logo: it.logo || '', group: it.group || '', id: it.id || '', kind: it.kind || '', yt: it.yt || null });
function trackLive(items, index){
  const it = items[index];
  if (isVod(it)) return;
  if (S.current && S.current.items[S.current.index] && S.current.items[S.current.index].url !== it.url && !isVod(S.current.items[S.current.index])){
    S.prevCtx = { items: S.current.items, index: S.current.index };
  }
  if (P.lastLive && P.lastLive.url !== it.url){ P.prevLive = P.lastLive; pstore.set('prevLive', P.prevLive); }
  P.lastLive = snap(it); pstore.set('lastLive', P.lastLive);
}
function prevChannel(){
  if (S.prevCtx) return play(S.prevCtx.items, S.prevCtx.index);
  if (P.prevLive) return play([P.prevLive], 0);
  toast('Todavía no hay un canal anterior');
}
function resumeLast(){
  if (!S.cfg.resumeLast || !P.lastLive || location.hash === '#no-resume') return;
  play([P.lastLive], 0);
}

/* =====================================================================
   Recomendaciones
   ===================================================================== */
async function recommend(){
  const st = P.stats;
  const catW = Object.entries(st.cat).sort((a, b) => b[1] - a[1]).slice(0, 4);
  let pool = [];
  try { pool = await loadRemote(countryUrl(S.country === 'spa' ? 'spa' : S.country)); } catch(e){}
  if (S.country !== 'spa'){ try { pool = pool.concat((await loadRemote(countryUrl('spa'))).slice(0, 400)); } catch(e){} }
  const seen = new Set();
  pool = pool.filter(i => !seen.has(i.url) && seen.add(i.url));
  const score = it => {
    let s = 0;
    catW.forEach(([c, w], i) => { if (cats(it).includes(c)) s += (4 - i) * 10 + Math.log(1 + w); });
    if (st.ch[it.url]) s += 5 + Math.log(1 + st.ch[it.url].s);
    const h = S.health[hk(it)]; if (h) s += h.ok ? 3 : -20;
    if (/horario limitado|solo en su país/.test(it.name)) s -= 2;
    return s;
  };
  const list = visibleItems(pool).map(it => [it, score(it)]).sort((a, b) => b[1] - a[1]).slice(0, 16).map(x => x[0]);
  const why = catW.length ? 'Según lo que más ves: ' + catW.slice(0, 3).map(([c]) => catName(c[0].toUpperCase() + c.slice(1))).join(', ') : 'Canales populares para empezar';
  return { list, why };
}

/* =====================================================================
   Pestaña Inicio
   ===================================================================== */
function viewInicio(){
  side.style.display = 'none';
  const pr = profile();
  const cont = continueItems();
  const favLive = P.favs.filter(f => !isVod(f) && f.kind !== 'radio').sort((a, b) => ((P.stats.ch[b.url] || {}).s || 0) - ((P.stats.ch[a.url] || {}).s || 0));
  const most = mostWatched().filter(m => !favLive.slice(0, 6).some(f => f.url === m.url));
  const favRadio = P.favs.filter(f => f.kind === 'radio');
  const yt = ytItems();
  const h = new Date().getHours();
  content.innerHTML = `
    <div class="topline"><div><h2>${h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'}, ${esc(pr.name)}</h2>
    <p class="sub">${new Date().toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div>
    <div class="row"><div class="wx" id="wx"><span class="muted">Cargando clima…</span></div><button class="btn ghost" id="trafBtn">🚗 Tráfico</button><button class="btn ghost" id="sumHome">📊 Mi resumen</button></div></div>
    ${P.lastLive ? `<button class="hero" id="heroLast">
        <div class="hero-img">${P.lastLive.logo ? `<img src="${esc(P.lastLive.logo)}" alt="" onerror="this.remove()">` : `<span class="ini">${esc(initials(P.lastLive.name))}</span>`}</div>
        <div><small>Seguir viendo</small><b>${esc(P.lastLive.name)}</b><span class="muted">${esc(nowNextLine(P.lastLive) || 'Toca para continuar')}</span></div>
        <span class="btn">▶ Ver</span></button>` : ''}
    ${favLive.length ? '<div class="section-title"><h3>⭐ Tus favoritos</h3></div><div id="rFav"></div>' : ''}
    ${cont.length ? '<div class="section-title"><h3>Continuar viendo</h3></div><div id="rCont"></div>' : ''}
    ${most.length ? `<div class="section-title"><h3>Lo que más ves</h3><small class="muted">Solo en el perfil de ${esc(pr.name)}</small></div><div id="rMost"></div>` : ''}
    ${famFavs().length ? '<div class="section-title"><h3>👪 Favoritos de la familia</h3></div><div id="rFam"></div>' : ''}
    <div class="section-title"><h3>Recomendados para ti</h3><small class="muted" id="whyRec"></small></div><div id="rRec"><div class="loading">Buscando canales…</div></div>
    ${pr.kids ? '' : '<div class="section-title"><h3>Deportes hoy</h3><button class="chip" id="toAgenda">Ver agenda completa</button></div><div id="rSport"><div class="loading">Cargando partidos…</div></div>'}
    ${favRadio.length ? '<div class="section-title"><h3>Tus radios</h3></div><div id="rRadio"></div>' : ''}
    ${yt.length ? '<div class="section-title"><h3>YouTube</h3></div><div id="rYt"></div>' : ''}
    ${pr.kids ? '' : '<div class="section-title"><h3>Mis apps</h3></div><div id="rApps"></div>'}`;
  if (P.lastLive) $('#heroLast').onclick = () => play([P.lastLive], 0);
  if (P.lastLive && P.lastLive.logo) $('#bgArt').style.backgroundImage = `url("${P.lastLive.logo.replace(/"/g, '')}")`;
  $('#trafBtn').onclick = openTraffic;
  $('#sumHome').onclick = openSummary;
  weather().then(v => { if ($('#wx')) $('#wx').innerHTML = weatherHTML(v); }).catch(() => { if ($('#wx')) $('#wx').innerHTML = '<span class="muted">Clima no disponible</span>'; });
  if (cont.length) renderGrid($('#rCont'), cont, '', { poster: true, row: true });
  if (favLive.length) renderGrid($('#rFav'), favLive, '', { live: false, row: true });
  if (most.length) renderGrid($('#rMost'), most, '', { live: false, row: true });
  if ($('#rFam')) renderGrid($('#rFam'), famFavs(), '', { live: false, row: true });
  if (favRadio.length) renderGrid($('#rRadio'), favRadio, '', { live: false, row: true });
  if (yt.length) renderGrid($('#rYt'), yt, '', { live: false, row: true });
  if ($('#rApps')) renderApps($('#rApps'));
  recommend().then(r => {
    if (S.tab !== 'inicio' || !$('#rRec')) return;
    $('#whyRec').textContent = r.why;
    renderGrid($('#rRec'), r.list, 'No hay recomendaciones todavía.', { live: false, row: true });
  });
  if ($('#toAgenda')){
    $('#toAgenda').onclick = () => { S.tab = 'deportes'; S.sportsScope = 'agenda'; render(); };
    loadAgenda(0).then(ev => {
      if (S.tab !== 'inicio' || !$('#rSport')) return;
      const now = Date.now();
      const list = ev.filter(e => e.state === 'in' || (e.state === 'pre' && e.start > now - 3600e3)).sort((a, b) => (a.state === 'in' ? -1 : 0) - (b.state === 'in' ? -1 : 0) || a.start - b.start).slice(0, 12);
      if (!list.length){ $('#rSport').innerHTML = `<div class="empty">${ev.error ? 'No se pudo cargar la agenda deportiva.' : 'No hay más partidos hoy en tus ligas.'}</div>`; return; }
      $('#rSport').innerHTML = `<div class="grid rowg">${list.map((e, i) => matchCard(e, i)).join('')}</div>`;
      $('#rSport').onclick = ev2 => { const c = ev2.target.closest('[data-mi]'); if (c) matchModal(list[+c.dataset.mi]); };
    });
  }
}

/* =====================================================================
   Accesos directos a apps de streaming
   ===================================================================== */
const APPS = [
  ['Netflix', 'https://www.netflix.com', 'com.netflix.ninja,com.netflix.mediaclient', '#b20710'],
  ['Disney+', 'https://www.disneyplus.com', 'com.disney.disneyplus', '#0e2f8f'],
  ['Prime Video', 'https://www.primevideo.com', 'com.amazon.amazonvideo.livingroom,com.amazon.avod.thirdpartyclient', '#0a6e9e'],
  ['Max', 'https://www.max.com', 'com.wbd.stream,com.hbo.hbonow', '#1b2bb3'],
  ['ViX', 'https://vix.com', 'com.univision.prendetv', '#c84a00'],
  ['Pluto TV', 'https://pluto.tv', 'tv.pluto.android', '#3d3a00'],
  ['Tubi', 'https://tubitv.com', 'com.tubitv', '#4b0aa8'],
  ['YouTube', 'https://www.youtube.com', 'com.google.android.youtube.tv,com.google.android.youtube', '#a10000']
];
function renderApps(target){
  target.innerHTML = `<div class="grid rowg">${APPS.map((a, i) => `<button class="card appcard" data-a="${i}" style="background:${a[3]}"><b>${esc(a[0])}</b><small>${android ? 'Abrir app' : 'Abrir sitio'}</small></button>`).join('')}</div>`;
  target.onclick = e => { const b = e.target.closest('[data-a]'); if (b) openApp(APPS[+b.dataset.a]); };
}
function openApp(a){
  if (android && android.launchApp){ android.launchApp(a[2], a[1]); return; }
  const l = document.createElement('a'); l.href = a[1]; l.target = '_blank'; l.rel = 'noopener';
  document.body.appendChild(l); l.click(); l.remove();
}

/* =====================================================================
   Agenda deportiva (marcadores públicos de ESPN)
   ===================================================================== */
const LEAGUES = [
  ['soccer/crc.1', 'Liga de Costa Rica', '⚽'], ['soccer/concacaf.champions', 'Concacaf Champions Cup', '⚽'],
  ['soccer/mex.1', 'Liga MX', '⚽'], ['soccer/uefa.champions', 'Champions League', '⚽'],
  ['soccer/esp.1', 'LaLiga', '⚽'], ['soccer/eng.1', 'Premier League', '⚽'], ['soccer/ita.1', 'Serie A', '⚽'],
  ['soccer/usa.1', 'MLS', '⚽'], ['soccer/conmebol.libertadores', 'Copa Libertadores', '⚽'],
  ['football/nfl', 'NFL', '🏈'], ['basketball/nba', 'NBA', '🏀'], ['baseball/mlb', 'MLB', '⚾']
];
const DEFAULT_LEAGUES = ['soccer/crc.1', 'soccer/concacaf.champions', 'soccer/mex.1', 'soccer/uefa.champions', 'soccer/esp.1', 'soccer/eng.1'];
const sbCache = {};
const ymd = d => d.toLocaleDateString('sv').replace(/-/g, '');
async function scoreboard(slug, dayOffset){
  const d = new Date(); d.setDate(d.getDate() + dayOffset);
  const key = slug + '|' + ymd(d);
  const c = sbCache[key];
  if (c && Date.now() - c.t < (dayOffset === 0 ? 60e3 : 600e3)) return c.v;
  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${slug}/scoreboard?dates=${ymd(d)}&lang=es&region=us`);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = await res.json();
  const lg = LEAGUES.find(l => l[0] === slug) || [slug, (j.leagues && j.leagues[0] && j.leagues[0].name) || slug, '🏆'];
  const v = (j.events || []).map(e => {
    const comp = (e.competitions || [])[0] || {};
    const team = side2 => { const t = (comp.competitors || []).find(x => x.homeAway === side2) || {}; return { name: (t.team && (t.team.shortDisplayName || t.team.displayName)) || '?', logo: (t.team && t.team.logo) || '', score: t.score ?? '' }; };
    const tv = [...new Set([...(comp.broadcasts || []).flatMap(b => b.names || []), ...(comp.geoBroadcasts || []).map(g => g.media && g.media.shortName).filter(Boolean)])];
    const st = (e.status && e.status.type) || {};
    return { id: e.id, slug, league: lg[1], icon: lg[2], start: Date.parse(e.date), state: st.state || 'pre', detail: st.shortDetail || st.detail || '', clock: (e.status && e.status.displayClock) || '', home: team('home'), away: team('away'), tv, name: e.name || '' };
  });
  sbCache[key] = { t: Date.now(), v };
  return v;
}
async function loadAgenda(dayOffset, leagues){
  const ls = leagues || S.cfg.leagues || DEFAULT_LEAGUES;
  let fails = 0;
  const all = (await Promise.all(ls.map(s => scoreboard(s, dayOffset).catch(() => { fails++; return []; })))).flat().sort((a, b) => a.start - b.start);
  if (fails === ls.length && ls.length) all.error = true;
  return all;
}
function allKnownChannels(){
  const out = [], seen = new Set();
  const add = it => { if (it && it.url && !seen.has(it.url) && !isVod(it)){ seen.add(it.url); out.push(it); } };
  P.favs.forEach(add);
  Object.values(S.cache).forEach(l => Array.isArray(l) && l.forEach(add));
  return out;
}
function channelForTv(tvNames){
  const chans = allKnownChannels();
  for (const tv of tvNames){
    const t = normName(tv); if (t.length < 3) continue;
    const hit = chans.find(c => normName(c.name) === t) || chans.find(c => normName(c.name).startsWith(t)) || chans.find(c => t.length >= 4 && normName(c.name).includes(t));
    if (hit && !P.hidden.some(h => h.url === hit.url)) return hit;
  }
  return null;
}
function matchStatus(e){
  if (e.state === 'in') return `<span class="live">● EN VIVO</span> ${esc(e.detail || e.clock)}`;
  if (e.state === 'post') return esc(e.detail || 'Final');
  return esc(fmtTime(new Date(e.start)));
}
function matchCard(e, i){
  return `<button class="card matchcard${e.state === 'in' ? ' live' : ''}" data-mi="${i}">
    <small class="muted">${e.icon} ${esc(e.league)}</small>
    <div class="teams"><div>${e.home.logo ? `<img src="${esc(e.home.logo)}" alt="" onerror="this.remove()">` : ''}<span>${esc(e.home.name)}</span><b>${e.state !== 'pre' ? esc(e.home.score) : ''}</b></div>
    <div>${e.away.logo ? `<img src="${esc(e.away.logo)}" alt="" onerror="this.remove()">` : ''}<span>${esc(e.away.name)}</span><b>${e.state !== 'pre' ? esc(e.away.score) : ''}</b></div></div>
    <small>${matchStatus(e)}${e.tv.length ? ' · 📺 ' + esc(e.tv.slice(0, 2).join(', ')) : ''}</small></button>`;
}
function matchModal(e){
  const ch = channelForTv(e.tv);
  const rid = 'm:' + e.id;
  const has = S.reminders.some(r => r.id === rid);
  const md = openModal(`<h3>${esc(e.home.name)} vs ${esc(e.away.name)}</h3>
    <p class="muted">${e.icon} ${esc(e.league)} · ${new Date(e.start).toLocaleString('es-CR', { weekday: 'long', hour: 'numeric', minute: '2-digit' })}</p>
    <p>${matchStatus(e)}</p>
    <p>${e.tv.length ? 'Transmite: <b>' + esc(e.tv.join(', ')) + '</b>' : 'Sin información de transmisión.'}</p>
    ${e.tv.length && !ch ? '<p class="muted" style="font-size:13px">Ese canal no está en tus listas. Si lo tienes con tu proveedor, agrega su lista en Ajustes.</p>' : ''}
    <div class="actions">
      ${e.state === 'pre' ? `<button class="btn ghost" id="mRem">${has ? '🔕 Quitar recordatorio' : '🔔 Recordarme'}</button>` : ''}
      ${e.state === 'post' ? '<button class="btn ghost" id="mHl">🎬 Ver resumen</button>' : ''}
      ${ch && e.state !== 'post' ? `<button class="btn" id="mPlay" autofocus>▶ Ver en ${esc(ch.name)}</button>` : ''}
      <button class="btn ghost" id="mNo">Cerrar</button></div>`);
  md.querySelector('#mNo').onclick = () => closeModal();
  if (md.querySelector('#mPlay')) md.querySelector('#mPlay').onclick = () => { closeModal(); play([ch], 0); };
  if (md.querySelector('#mHl')) md.querySelector('#mHl').onclick = () => openExternalUrl(highlightsUrl(e));
  const rb = md.querySelector('#mRem');
  if (rb) rb.onclick = () => {
    if (has) removeReminder(rid);
    else addReminder({ id: rid, at: e.start, title: `${e.home.name} vs ${e.away.name}`, body: e.league + (e.tv.length ? ' · ' + e.tv[0] : ''), ch: ch ? snap(ch) : null });
    closeModal();
  };
}
async function viewAgenda(target){
  const day = S.agendaDay || 0;
  const ls = S.cfg.leagues || DEFAULT_LEAGUES;
  const sel = S.agendaLeague || '';
  target.innerHTML = `<div class="toolbar" id="agDays">${[['-1','Ayer'],['0','Hoy'],['1','Mañana'],['2','Pasado mañana']].map(([d, n]) => `<button class="chip ${+d === day ? 'active' : ''}" data-d="${d}">${n}</button>`).join('')}</div>
    <div class="toolbar" id="agLg"><button class="chip ${!sel ? 'active' : ''}" data-l="">Todas</button>${ls.map(s => { const l = LEAGUES.find(x => x[0] === s); return `<button class="chip ${sel === s ? 'active' : ''}" data-l="${s}">${l ? l[2] + ' ' + esc(l[1]) : esc(s)}</button>`; }).join('')}</div>
    <div id="agList"><div class="loading">Cargando partidos…</div></div>
    <p class="muted" style="font-size:12px">Elige tus ligas en Ajustes → Agenda deportiva. Horarios en hora de Costa Rica. Datos de marcadores públicos de ESPN.</p>`;
  $('#agDays').onclick = e => { const b = e.target.closest('[data-d]'); if (!b) return; S.agendaDay = +b.dataset.d; viewAgenda(target); };
  $('#agLg').onclick = e => { const b = e.target.closest('[data-l]'); if (!b) return; S.agendaLeague = b.dataset.l; viewAgenda(target); };
  const ev = await loadAgenda(day, sel ? [sel] : ls);
  const box = $('#agList'); if (!box) return;
  if (!ev.length){ box.innerHTML = `<div class="empty">${ev.error ? 'No se pudo cargar la agenda. Revisa tu conexión; el servicio de marcadores podría no estar disponible.' : 'No hay partidos ese día en las ligas elegidas.'}</div>`; return; }
  const groups = {};
  ev.forEach((e, i) => { (groups[e.league] = groups[e.league] || []).push([e, i]); });
  box.innerHTML = Object.entries(groups).map(([lg, arr]) => `<div class="section-title"><h3>${arr[0][0].icon} ${esc(lg)}</h3></div>
    <div class="matches">${arr.map(([e, i]) => {
      const ch = channelForTv(e.tv);
      const rem = S.reminders.some(r => r.id === 'm:' + e.id);
      return `<div class="match${e.state === 'in' ? ' live' : ''}"><div class="mt">${matchStatus(e)}</div>
        <div class="mteams"><span>${e.home.logo ? `<img src="${esc(e.home.logo)}" alt="" onerror="this.remove()">` : ''}${esc(e.home.name)} <b>${e.state !== 'pre' ? esc(e.home.score) : ''}</b></span>
        <span>${e.away.logo ? `<img src="${esc(e.away.logo)}" alt="" onerror="this.remove()">` : ''}${esc(e.away.name)} <b>${e.state !== 'pre' ? esc(e.away.score) : ''}</b></span></div>
        <div class="mtv muted">${e.tv.length ? '📺 ' + esc(e.tv.join(', ')) : ''}</div>
        <div class="row">${ch && e.state !== 'post' ? `<button class="btn small" data-play="${i}">▶ ${esc(ch.name.slice(0, 18))}</button>` : ''}${e.state === 'pre' ? `<button class="btn ghost small" data-rem="${i}">${rem ? '🔕' : '🔔'}</button>` : ''}${e.state === 'post' ? `<button class="btn ghost small" data-hl="${i}">🎬 Resumen</button>` : ''}<button class="btn ghost small" data-info="${i}">Detalles</button></div></div>`;
    }).join('')}</div>`).join('');
  box.onclick = e => {
    const p = e.target.closest('[data-play]'), r = e.target.closest('[data-rem]'), inf = e.target.closest('[data-info]');
    if (p){ const ch = channelForTv(ev[+p.dataset.play].tv); if (ch) play([ch], 0); }
    if (r){ const m = ev[+r.dataset.rem], rid = 'm:' + m.id;
      if (S.reminders.some(x => x.id === rid)) removeReminder(rid);
      else { const ch = channelForTv(m.tv); addReminder({ id: rid, at: m.start, title: `${m.home.name} vs ${m.away.name}`, body: m.league, ch: ch ? snap(ch) : null }); }
      viewAgenda(target); }
    if (inf) matchModal(ev[+inf.dataset.info]);
    const hl = e.target.closest('[data-hl]'); if (hl) openExternalUrl(highlightsUrl(ev[+hl.dataset.hl]));
  };
}

/* Marcadores en vivo dentro del reproductor */
let tickerTimer = null;
async function updateTicker(){
  const t = $('#ticker');
  if (!S.cfg.ticker || !player.classList.contains('open') || profile().kids){ t.classList.remove('show'); return; }
  const ev = (await loadAgenda(0)).filter(e => e.state === 'in');
  if (!ev.length){ t.classList.remove('show'); return; }
  const txt = ev.map(e => `${e.icon} ${e.home.name} ${e.home.score}-${e.away.score} ${e.away.name} <i>${esc(e.detail || e.clock)}</i>`).join('<span class="sep">•</span>');
  t.innerHTML = `<div class="tk">${txt}<span class="sep">•</span>${txt}</div>`;
  t.classList.add('show');
}
function startTicker(){ clearInterval(tickerTimer); updateTicker(); tickerTimer = setInterval(updateTicker, 60000); }
function stopTicker(){ clearInterval(tickerTimer); $('#ticker').classList.remove('show'); }

/* =====================================================================
   Recordatorios
   ===================================================================== */
function saveReminders(){ store.set('reminders', S.reminders); }
async function addReminder(r){
  r.notified = false;
  S.reminders = S.reminders.filter(x => x.id !== r.id).concat(r);
  saveReminders();
  const when = r.at - 5*60e3;
  if (android && android.scheduleReminder) android.scheduleReminder(r.id, Math.max(Date.now() + 5000, when), '🔔 ' + r.title, 'Empieza a las ' + fmtTime(new Date(r.at)) + (r.body ? ' · ' + r.body : ''));
  else if ('Notification' in window && Notification.permission === 'default'){ try { await Notification.requestPermission(); } catch(e){} }
  toast('Te aviso 5 minutos antes (' + fmtTime(new Date(r.at)) + ')' + (android ? '' : '. Deja la app abierta.'));
}
function removeReminder(id){
  S.reminders = S.reminders.filter(x => x.id !== id); saveReminders();
  android && android.cancelReminder && android.cancelReminder(id);
  toast('Recordatorio quitado');
}
function checkReminders(){
  const now = Date.now();
  let changed = false;
  S.reminders.forEach(r => {
    if (!r.notified && now >= r.at - 5*60e3 && now < r.at + 30*60e3){
      r.notified = true; changed = true;
      if ('Notification' in window && Notification.permission === 'granted' && document.hidden && !android){ try { new Notification('🔔 ' + r.title, { body: 'Empieza a las ' + fmtTime(new Date(r.at)) }); } catch(e){} }
      const md = openModal(`<h3>🔔 ${esc(r.title)}</h3><p>Empieza a las <b>${fmtTime(new Date(r.at))}</b>${r.body ? ' · ' + esc(r.body) : ''}.</p>
        <div class="actions"><button class="btn ghost" id="rNo">Cerrar</button>${r.ch ? `<button class="btn" id="rGo" autofocus>▶ Ver ${esc(r.ch.name)}</button>` : ''}</div>`);
      md.querySelector('#rNo').onclick = () => closeModal();
      if (r.ch) md.querySelector('#rGo').onclick = () => { closeModal(); play([r.ch], 0); };
    }
  });
  const before = S.reminders.length;
  S.reminders = S.reminders.filter(r => r.at > now - 3*3600e3);
  if (changed || before !== S.reminders.length) saveReminders();
}

/* Acciones sobre un programa de la guía */
function programModal(it, p){
  const rid = 'p:' + it.url + '|' + p.start;
  const has = S.reminders.some(r => r.id === rid);
  const future = p.start > Date.now();
  const md = openModal(`<h3>${esc(p.title)}</h3><p class="muted">${esc(it.name)} · ${fmtTime(new Date(p.start))} – ${fmtTime(new Date(p.stop))}</p>
    ${p.desc ? `<p>${esc(p.desc)}</p>` : ''}
    <div class="actions">
      ${future ? `<button class="btn ghost" id="pgRem">${has ? '🔕 Quitar recordatorio' : '🔔 Recordarme'}</button>` : ''}
      ${canRecord() && p.stop > Date.now() ? '<button class="btn ghost" id="pgRec">⏺ Grabar</button>' : ''}
      <button class="btn" id="pgPlay" autofocus>▶ Ver canal</button></div>`);
  md.querySelector('#pgPlay').onclick = () => { closeModal(); play([it], 0); };
  const r = md.querySelector('#pgRem');
  if (r) r.onclick = () => { if (has) removeReminder(rid); else addReminder({ id: rid, at: p.start, title: p.title, body: it.name, ch: snap(it) }); closeModal(); };
  const g = md.querySelector('#pgRec');
  if (g) g.onclick = async () => { closeModal(); await scheduleRecording(it, Math.max(Date.now(), p.start - 60e3), Math.ceil((p.stop - Math.max(Date.now(), p.start)) / 60e3) + 3, p.title); };
}

/* =====================================================================
   Pausa en vivo
   ===================================================================== */
let liveTimer = null;
function setupLiveControls(isLive){
  $('#pBack').style.display = $('#pLive').style.display = isLive ? '' : 'none';
  clearInterval(liveTimer);
  if (!isLive) return;
  liveTimer = setInterval(() => {
    if (!hls || !player.classList.contains('open')) return;
    const edge = hls.liveSyncPosition;
    const behind = edge ? edge - video.currentTime : 0;
    $('#pLive').textContent = behind > 12 ? `⏩ En vivo (−${fmtDur(behind)})` : '● En vivo';
    $('#pLive').classList.toggle('behind', behind > 12);
  }, 1000);
}
function goLive(){ if (hls && hls.liveSyncPosition) video.currentTime = hls.liveSyncPosition; video.play().catch(() => {}); }
function back30(){
  const s = video.seekable, b = video.buffered;
  const min = Math.min(s.length ? s.start(0) : Infinity, b.length ? b.start(0) : Infinity);
  video.currentTime = Math.max(isFinite(min) ? min : 0, video.currentTime - 30);
}

/* =====================================================================
   Grabaciones (versión para computadora)
   ===================================================================== */
const canRecord = () => !android && !!(window.Hls && Hls.isSupported());
const recs = [];
let recSeq = 0;
function recIndicator(){
  const n = recs.filter(r => r.status === 'grabando').length;
  const el = $('#recDot'); el.style.display = n ? '' : 'none'; el.textContent = `⏺ Grabando${n > 1 ? ' (' + n + ')' : ''}`;
}
async function askSaveHandle(name){
  if (!window.showSaveFilePicker) return null;
  try { return await window.showSaveFilePicker({ suggestedName: name + '.ts', types: [{ description: 'Video', accept: { 'video/mp2t': ['.ts'], 'video/mp4': ['.mp4'] } }] }); }
  catch(e){ if (e.name === 'AbortError') throw e; return null; }
}
async function startRecording(it, { endAt, handle, title } = {}){
  if (!/m3u8/i.test(it.url)){ toast('Solo se pueden grabar canales en formato HLS (m3u8)'); return null; }
  const rec = { id: ++recSeq, name: (title || it.name).replace(/[\\/:*?"<>|]+/g, ' ') + ' ' + new Date().toLocaleString('es-CR').replace(/[/:]/g, '-'), ch: it.name, url: it.url, start: Date.now(), endAt: endAt || 0, status: 'grabando', bytes: 0, parts: [], writable: null, queue: Promise.resolve(), ext: 'ts' };
  if (handle){ try { rec.writable = await handle.createWritable(); rec.file = handle.name; } catch(e){ rec.writable = null; } }
  const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.style.display = 'none'; document.body.appendChild(v);
  const h = new Hls({ enableWorker: false, backBufferLength: 0, maxBufferLength: 20, startLevel: -1 });
  rec.hls = h; rec.video = v;
  let first = true;
  h.on(Hls.Events.FRAG_LOADED, (_, d) => {
    if (rec.status !== 'grabando' || !d.payload || !d.payload.byteLength) return;
    const chunk = new Uint8Array(d.payload.slice(0));
    if (first){ first = false; if (chunk[0] !== 0x47) rec.ext = 'mp4'; }
    rec.bytes += chunk.byteLength;
    if (rec.writable) rec.queue = rec.queue.then(() => rec.writable.write(chunk)).catch(() => {});
    else {
      rec.parts.push(chunk);
      if (rec.bytes > 1.5e9){ toast('La grabación llegó al límite de memoria y se detuvo'); stopRecording(rec); }
    }
  });
  h.on(Hls.Events.ERROR, (_, d) => { if (d.fatal){ if (d.type === Hls.ErrorTypes.NETWORK_ERROR) setTimeout(() => rec.status === 'grabando' && h.startLoad(), 5000); else h.recoverMediaError(); } });
  h.loadSource(it.url); h.attachMedia(v); v.play().catch(() => {});
  recs.unshift(rec); recIndicator();
  toast('⏺ Grabando ' + it.name);
  return rec;
}
async function stopRecording(rec){
  if (rec.status !== 'grabando') return;
  rec.status = 'terminada'; rec.end = Date.now();
  try { rec.hls.destroy(); } catch(e){}
  rec.video.remove();
  if (rec.writable){ await rec.queue; try { await rec.writable.close(); } catch(e){} rec.saved = true; }
  else if (rec.parts.length){ rec.blobUrl = URL.createObjectURL(new Blob(rec.parts, { type: rec.ext === 'ts' ? 'video/mp2t' : 'video/mp4' })); rec.parts = []; downloadRec(rec); }
  recIndicator();
  toast('Grabación terminada: ' + rec.ch);
  if (S.tab === 'ajustes') renderRecBox();
}
function downloadRec(rec){
  if (!rec.blobUrl) return;
  const a = document.createElement('a'); a.href = rec.blobUrl; a.download = rec.name + '.' + rec.ext; document.body.appendChild(a); a.click(); a.remove();
}
async function scheduleRecording(it, at, durMin, title){
  if (!canRecord()){ toast('Las grabaciones funcionan en la versión para computadora'); return; }
  let handle = null;
  try { handle = await askSaveHandle((title || it.name).replace(/[\\/:*?"<>|]+/g, ' ')); } catch(e){ return; }
  const s = { id: 'g' + Date.now(), at, endAt: at + durMin * 60e3, item: snap(it), title: title || it.name, started: false };
  S.recHandles[s.id] = handle;
  S.recSched.push(s); store.set('recsched', S.recSched);
  toast(at <= Date.now() + 5000 ? 'Grabación iniciada' : `Grabación programada para las ${fmtTime(new Date(at))}. Deja la app abierta.`);
  checkRecordings();
}
function checkRecordings(){
  const now = Date.now();
  S.recSched.forEach(s => {
    if (!s.started && now >= s.at && now < s.endAt){
      s.started = true;
      startRecording(s.item, { endAt: s.endAt, handle: S.recHandles[s.id], title: s.title });
    }
  });
  recs.forEach(r => { if (r.status === 'grabando' && r.endAt && now >= r.endAt) stopRecording(r); });
  const before = S.recSched.length;
  S.recSched = S.recSched.filter(s => s.endAt > now);
  store.set('recsched', S.recSched);
  if (before !== S.recSched.length && S.tab === 'ajustes') renderRecBox();
}
function renderRecBox(){
  const box = $('#recBox'); if (!box) return;
  if (!canRecord()){ box.innerHTML = '<p class="muted" style="margin:0">Las grabaciones están disponibles en la versión para computadora (archivo MiTV.html en Chrome o Edge).</p>'; return; }
  const fmtB = b => b > 1e9 ? (b/1e9).toFixed(2) + ' GB' : Math.round(b/1e6) + ' MB';
  box.innerHTML = `<p class="muted" style="margin-top:0">Graba canales en vivo (formato HLS) a un archivo que puedes ver con VLC. La app debe quedar abierta mientras graba.${window.showSaveFilePicker ? '' : ' Tu navegador guardará el archivo al terminar.'}</p>
    <form id="fRec" class="row">
      <div class="field" style="min-width:180px"><label>Canal</label><select id="recCh">${[...P.favs, ...P.recents].filter((x, i, a) => !isVod(x) && x.kind !== 'youtube' && a.findIndex(y => y.url === x.url) === i).map((x, i) => `<option value="${i}">${esc(x.name)}</option>`).join('') || '<option value="">(ve o marca canales primero)</option>'}</select></div>
      <div class="field" style="max-width:230px"><label>Inicio</label><input id="recAt" type="datetime-local"></div>
      <div class="field" style="max-width:120px"><label>Minutos</label><input id="recDur" type="number" min="1" max="600" value="60"></div>
      <button class="btn" style="margin-top:8px">Programar</button></form>
    ${S.recSched.map(s => `<div class="list-item"><div class="grow"><b>⏰ ${esc(s.title)}</b><small>${esc(s.item.name)} · ${new Date(s.at).toLocaleString('es-CR')} · ${Math.round((s.endAt - s.at)/60e3)} min</small></div><button class="btn danger small" data-cs="${s.id}">Cancelar</button></div>`).join('')}
    ${recs.map(r => `<div class="list-item"><div class="grow"><b>${r.status === 'grabando' ? '⏺' : '✔'} ${esc(r.ch)}</b><small>${esc(r.status)} · ${fmtB(r.bytes)}${r.file ? ' · ' + esc(r.file) : ''}</small></div>
      ${r.status === 'grabando' ? `<button class="btn danger small" data-stop="${r.id}">Detener</button>` : r.blobUrl ? `<button class="btn ghost small" data-dl="${r.id}">Descargar</button>` : ''}</div>`).join('')}`;
  const opts = [...P.favs, ...P.recents].filter((x, i, a) => !isVod(x) && x.kind !== 'youtube' && a.findIndex(y => y.url === x.url) === i);
  const d = new Date(Date.now() + 10*60e3); d.setSeconds(0, 0);
  $('#recAt').value = new Date(d - d.getTimezoneOffset()*60e3).toISOString().slice(0, 16);
  $('#fRec').onsubmit = e => {
    e.preventDefault();
    const it = opts[+$('#recCh').value]; if (!it){ toast('Elige un canal'); return; }
    const at = new Date($('#recAt').value).getTime();
    if (!at){ toast('Elige la hora'); return; }
    scheduleRecording(it, Math.max(at, Date.now()), +$('#recDur').value || 60).then(renderRecBox);
  };
  box.onclick = e => {
    const st = e.target.closest('[data-stop]'), dl = e.target.closest('[data-dl]'), cs = e.target.closest('[data-cs]');
    if (st) stopRecording(recs.find(r => r.id === +st.dataset.stop));
    if (dl) downloadRec(recs.find(r => r.id === +dl.dataset.dl));
    if (cs){ S.recSched = S.recSched.filter(s => s.id !== cs.dataset.cs); store.set('recsched', S.recSched); renderRecBox(); }
  };
}

/* =====================================================================
   Radio y podcasts
   ===================================================================== */
const RB = ['https://de1.api.radio-browser.info', 'https://nl1.api.radio-browser.info', 'https://at1.api.radio-browser.info'];
async function rbGet(path){
  let last;
  for (const h of RB){
    try { const r = await fetch(h + path); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
    catch(e){ last = e; }
  }
  throw last;
}
const RADIO_TAG = { cr: 'costa rica', mx: 'mexico', gt: 'guatemala', sv: 'el salvador', hn: 'honduras', ni: 'nicaragua', pa: 'panama', co: 'colombia', ve: 'venezuela', ec: 'ecuador', pe: 'peru', bo: 'bolivia', cl: 'chile', ar: 'argentina', uy: 'uruguay', py: 'paraguay', do: 'republica dominicana', cu: 'cuba', pr: 'puerto rico' };
async function radioStations(cc){
  const key = 'rb2:' + cc;
  if (S.cache[key]) return S.cache[key];
  const c = store.get('c:' + key, null);
  let raw;
  if (c && Date.now() - c.t < 24*3600e3) raw = c.v;
  else {
    const CC = cc.toUpperCase(), tag = RADIO_TAG[cc];
    // Además del país, buscar emisoras etiquetadas con el nombre del país
    const reqs = [rbGet(`/json/stations/bycountrycodeexact/${CC}?order=clickcount&reverse=true&limit=1000`)];
    if (tag) reqs.push(rbGet(`/json/stations/search?tag=${encodeURIComponent(tag)}&order=clickcount&reverse=true&limit=500`).then(l => l.filter(s => !s.countrycode || s.countrycode === CC)).catch(() => []));
    raw = (await Promise.all(reqs)).flat().map(s => ({ name: s.name, url_resolved: s.url_resolved || s.url, favicon: s.favicon, tags: s.tags, stationuuid: s.stationuuid, ok: s.lastcheckok === 0 ? 0 : 1 }));
    store.set('c:' + key, { t: Date.now(), v: raw });
  }
  const seen = new Set();
  const nk = s => normName(s.name) || s.name.trim().toLowerCase();
  // Primero las que funcionaban en la última revisión; si una emisora aparece dos veces, se queda la que funciona
  const sorted = raw.filter(s => s.url_resolved && s.name).sort((a, b) => (b.ok ?? 1) - (a.ok ?? 1));
  return (S.cache[key] = sorted.filter(s => !seen.has(nk(s)) && seen.add(nk(s))).map(rbItem));
}
function rbItem(s){
  const tags = (s.tags || '').split(',').filter(Boolean).slice(0, 2).join(' · ');
  const where = s.country && s.countrycode !== 'CR' ? s.country : '';
  return { name: s.name.trim(), url: s.url_resolved || s.url, logo: s.favicon || '', id: 'rb:' + s.stationuuid, kind: 'radio',
    group: [where, tags || 'Radio'].filter(Boolean).join(' · ') + ((s.ok ?? (s.lastcheckok === 0 ? 0 : 1)) === 0 ? ' · puede fallar' : '') };
}
// Buscar cualquier emisora del directorio por nombre o frecuencia
async function radioSearch(q, cc){
  const l = await rbGet(`/json/stations/search?name=${encodeURIComponent(q)}&order=clickcount&reverse=true&limit=120`);
  const CC = (cc || 'cr').toUpperCase(), seen = new Set();
  return l.filter(s => s.url_resolved || s.url).sort((a, b) => ((b.countrycode === CC) - (a.countrycode === CC)) || ((b.lastcheckok || 0) - (a.lastcheckok || 0)))
    .filter(s => { const k = normName(s.name) + '|' + s.countrycode; return !seen.has(k) && seen.add(k); }).map(rbItem);
}
// 3.11: emisoras de Costa Rica que van primero. Radio Nacional usa el enlace publicado por SINART;
// las demás se toman del directorio si están ahí (y que respondieron en la última revisión).
const CR_RADIO_TOP = [
  ['Radio Nacional 101.5', /radio nacional/i], ['Radio Universidad 96.7', /radio universidad|96[.,]7/i], ['Radio U 101.9', /^radio u\b|101[.,]9/i],
  ['Radio 870 UCR', /870/], ['Columbia', /columbia/i], ['Monumental', /monumental/i], ['Reloj', /reloj/i], ['Faro del Caribe', /faro del caribe/i],
  ['Radio 2', /^radio 2\b|99[.,]5/i], ['Bésame', /b[eé]same/i], ['Teletica Radio', /teletica/i], ['Sinfonola', /sinfonola/i]
];
function crFeaturedRadios(all){
  const out = [{ name: 'Radio Nacional 101.5 FM (SINART)', url: 'https://stream.sinart.go.cr/radionacional', kind: 'radio', id: 'cr:radionacional', logo: '', group: 'Pública · Noticias · Cultura' }];
  const used = new Set(out.map(i => i.url));
  for (const [, re] of CR_RADIO_TOP.slice(1)){
    const hit = all.find(i => re.test(i.name) && !/puede fallar/.test(i.group) && !used.has(i.url));
    if (hit){ out.push(hit); used.add(hit.url); }
  }
  return out;
}
function viewRadio(){
  side.style.display = '';
  const v = S.radioView || 'cr';
  side.innerHTML = '<h4>Radio</h4>' + sideButton('Mis radios', v === 'fav', 'data-r="fav"', '⭐') + sideButton('Podcasts', v === 'pod', 'data-r="pod"', '🎙️') +
    '<h4>Países</h4>' + COUNTRIES.map(([c, n, f]) => sideButton(n, v === c, `data-r="${c}"`, f)).join('');
  side.onclick = e => { const b = e.target.closest('button'); if (!b) return; S.radioView = b.dataset.r; S.podView = null; render(); };
  if (v === 'pod') return viewPodcasts();
  if (v === 'fav'){
    content.innerHTML = `<h2>⭐ Mis radios</h2><p class="sub">Tus favoritas (marca con ☆ mientras escuchas) y las emisoras que agregues tú.</p>
      <form id="fMyRadio" class="row"><div class="field" style="max-width:220px"><input id="mrName" placeholder="Nombre de la radio" required></div><div class="field"><input id="mrUrl" type="url" placeholder="Enlace de transmisión (https://…)" required></div><button class="btn">Agregar radio</button></form>
      <p class="muted" style="font-size:13px;margin-top:0">El enlace de transmisión suele estar en la página de la emisora, en el botón “Escuchar en vivo”. También puedes copiarlo desde VLC o desde otra app de radio.</p><div id="g"></div>`;
    $('#fMyRadio').onsubmit = e => { e.preventDefault(); addCustom($('#mrName').value.trim(), $('#mrUrl').value.trim(), 'radio'); render(); };
    const mine = customItems('radio');
    return renderGrid($('#g'), [...mine, ...P.favs.filter(f => f.kind === 'radio' && !mine.some(m => m.url === f.url))], 'Todavía no tienes radios favoritas.', { live: false });
  }
  const c = COUNTRIES.find(x => x[0] === v) || COUNTRIES[0];
  content.innerHTML = `<h2>📻 Radios de ${c[2]} ${esc(c[1])}</h2>
    <p class="sub">Emisoras que transmiten por internet, ordenadas por popularidad. Las marcadas con “puede fallar” no respondieron en la última revisión del directorio.</p>
    <form id="fRq" class="row"><div class="field" style="margin:0"><input id="rq" placeholder="¿No está tu emisora? Búscala por nombre o frecuencia (ej. Columbia, 98.7)" value="${esc(S.radioQ || '')}"></div><button class="btn">Buscar</button>${S.radioQ ? '<button type="button" class="btn ghost" id="rqClr">Ver todas</button>' : ''}</form>
    <p class="muted" id="rqInfo" style="font-size:13px"></p><div id="g"></div>`;
  $('#fRq').onsubmit = e => { e.preventDefault(); S.radioQ = $('#rq').value.trim(); render(); };
  if ($('#rqClr')) $('#rqClr').onclick = () => { S.radioQ = ''; render(); };
  if (S.radioQ){
    return withLoading($('#g'), async () => {
      const r = await radioSearch(S.radioQ, c[0]);
      $('#rqInfo').textContent = r.length ? `${r.length} emisoras encontradas para “${S.radioQ}” (primero las de ${c[1]}). Márcalas con ☆ para tenerlas en Mis radios.` : '';
      renderGrid($('#g'), r, `No se encontró “${esc(S.radioQ)}”. Si conoces el enlace de transmisión, agrégala en Mis radios.`, { live: false });
    });
  }
  if (c[0] === 'cr') $('#g').insertAdjacentHTML('beforebegin', '<div class="section-title"><h3>⭐ Destacadas de Costa Rica</h3><span class="muted">Emisoras públicas, universitarias y las más escuchadas</span></div><div id="gTop"></div><div class="section-title"><h3>Todas las emisoras</h3></div>');
  withLoading($('#g'), async () => {
    const l = await radioStations(c[0]);
    if (c[0] === 'cr' && $('#gTop')) renderGrid($('#gTop'), crFeaturedRadios(l), '', { live: false, row: true });
    $('#rqInfo').textContent = `${l.length} emisoras · ${l.filter(i => !/puede fallar/.test(i.group)).length} respondieron en la última revisión.`;
    renderGrid($('#g'), l, 'No se encontraron radios.', { live: false });
  });
}
/* Podcasts: búsqueda en el directorio público de Apple (JSONP) y lectura del RSS */
function itunesSearch(term){
  return new Promise((resolve, reject) => {
    const cb = 'mitvIt' + Date.now();
    const s = document.createElement('script');
    const tm = setTimeout(() => { cleanup(); reject(new Error('sin respuesta')); }, 12000);
    const cleanup = () => { clearTimeout(tm); delete window[cb]; s.remove(); };
    window[cb] = j => { cleanup(); resolve(j.results || []); };
    s.onerror = () => { cleanup(); reject(new Error('no disponible')); };
    s.src = `https://itunes.apple.com/search?media=podcast&country=CR&limit=30&term=${encodeURIComponent(term)}&callback=${cb}`;
    document.head.appendChild(s);
  });
}
async function loadFeed(url){
  const text = await fetchText(url);
  const x = new DOMParser().parseFromString(text, 'text/xml');
  if (x.querySelector('parsererror')) throw new Error('el podcast no es válido');
  const ch = x.querySelector('channel');
  const tag = (el, n) => { const t = el.getElementsByTagName(n)[0]; return t ? t.textContent.trim() : ''; };
  const img = (ch.getElementsByTagName('itunes:image')[0] || {}).getAttribute?.('href') || tag(ch.querySelector('image') || ch, 'url');
  const eps = [...x.querySelectorAll('item')].map(i => {
    const enc = i.querySelector('enclosure');
    if (!enc || !enc.getAttribute('url')) return null;
    const d = Date.parse(tag(i, 'pubDate'));
    const ii = (i.getElementsByTagName('itunes:image')[0] || null);
    return { name: tag(i, 'title'), url: enc.getAttribute('url'), kind: 'podcast', poster: (ii && ii.getAttribute('href')) || img, overview: tag(i, 'description').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 600),
      group: d ? new Date(d).toLocaleDateString('es-CR', { day: 'numeric', month: 'short', year: 'numeric' }) : '', year: d ? new Date(d).toLocaleDateString('es-CR') : '' };
  }).filter(Boolean).slice(0, 150);
  return { title: tag(ch, 'title'), art: img, desc: tag(ch, 'description').replace(/<[^>]+>/g, ' ').slice(0, 300), eps };
}
function viewPodcasts(){
  if (S.podView){
    const pod = S.podView;
    content.innerHTML = `<button class="btn ghost small" id="back">← Podcasts</button><div id="g"><div class="loading">Cargando episodios…</div></div>`;
    $('#back').onclick = () => { S.podView = null; render(); };
    return withLoading($('#g'), async () => {
      let f;
      try { f = await loadFeed(pod.feed); }
      catch(e){ throw new Error(e.message + (android ? '' : '. Algunos podcasts solo abren en la app Android')); }
      const subbed = P.pods.some(p => p.feed === pod.feed);
      $('#g').innerHTML = `<div class="detail" style="margin:14px 0">${f.art || pod.art ? `<img src="${esc(f.art || pod.art)}" alt="" style="width:120px">` : ''}<div><h2>${esc(f.title || pod.name)}</h2><p class="muted">${esc(f.desc)}</p>
        <button class="btn ${subbed ? 'ghost' : ''}" id="sub">${subbed ? '✓ Suscrito' : '+ Suscribirme'}</button></div></div><div id="eps"></div>`;
      $('#sub').onclick = () => {
        if (subbed) P.pods = P.pods.filter(p => p.feed !== pod.feed);
        else P.pods.push({ name: f.title || pod.name, feed: pod.feed, art: f.art || pod.art });
        pstore.set('pods', P.pods); render();
      };
      f.eps.forEach(e => { e.key = 'pod:' + e.url; });
      renderGrid($('#eps'), f.eps, 'Este podcast no tiene episodios de audio.', { poster: true });
    });
  }
  content.innerHTML = `<h2>🎙️ Podcasts</h2><p class="sub">Busca cualquier podcast y suscríbete. Recuerda el minuto donde quedaste.</p>
    <form id="fPod" class="row"><div class="field"><input id="podQ" placeholder="Buscar podcasts (ej. noticias Costa Rica, fútbol)" value="${esc(S.podQ || '')}"></div><button class="btn">Buscar</button></form>
    <div class="row chips" id="podCr" style="margin:-4px 0 12px">🇨🇷 ${['Noticias Costa Rica', 'Radioemisoras UCR', 'Semanario Universidad', 'Fútbol Costa Rica', 'Historia de Costa Rica', 'Emprendimiento Costa Rica'].map(t => `<button class="chip" type="button" data-q="${t}">${t}</button>`).join('')}</div>
    ${P.pods.length ? '<div class="section-title"><h3>Mis podcasts</h3></div><div id="gSub"></div>' : ''}
    <div id="gRes"></div>`;
  const toCards = arr => arr.map(p => ({ name: p.name, poster: p.art, kind: 'series', url: 'pod:' + p.feed, feed: p.feed, art: p.art, group: p.author || '' }));
  const open = it => { S.podView = { name: it.name, feed: it.feed, art: it.art }; render(); };
  if (P.pods.length) renderGrid($('#gSub'), toCards(P.pods), '', { poster: true, onOpen: open });
  $('#fPod').onsubmit = async e => {
    e.preventDefault();
    S.podQ = $('#podQ').value.trim(); if (!S.podQ) return;
    const g = $('#gRes'); g.innerHTML = '<div class="loading">Buscando…</div>';
    try {
      const res = await itunesSearch(S.podQ);
      renderGrid(g, toCards(res.filter(r => r.feedUrl).map(r => ({ name: r.collectionName, feed: r.feedUrl, art: r.artworkUrl600 || r.artworkUrl100, author: r.artistName }))), 'Sin resultados.', { poster: true, onOpen: open });
    } catch(err){ g.innerHTML = `<div class="empty">No se pudo buscar (${esc(err.message)}).</div>`; }
  };
  $('#podCr').onclick = e => { const b = e.target.closest('[data-q]'); if (!b) return; $('#podQ').value = b.dataset.q; $('#fPod').requestSubmit(); };
  if (S.podQ) $('#fPod').requestSubmit();
}

/* =====================================================================
   Canales de YouTube
   ===================================================================== */
function parseYt(input){
  const s = input.trim();
  let m;
  if ((m = s.match(/[?&]list=([\w-]+)/))) return { type: 'playlist', id: m[1] };
  if ((m = s.match(/(?:youtu\.be\/|[?&]v=|\/live\/|\/shorts\/)([\w-]{11})/))) return { type: 'video', id: m[1] };
  if ((m = s.match(/(UC[\w-]{22})/))) return { type: 'uploads', id: m[1] };
  if (/@[\w.-]+/.test(s)) throw new Error('Para canales con @nombre, pega el ID del canal (empieza con UC). En YouTube: canal → Más información → Compartir canal → Copiar ID del canal');
  throw new Error('No reconozco ese enlace de YouTube');
}
function ytItems(){
  return (S.cfg.yt || []).map(y => ({ name: y.name, url: 'yt:' + y.type + ':' + y.id, kind: 'youtube', yt: { type: y.type, id: y.id }, logo: '', group: y.type === 'live' ? 'YouTube en vivo' : 'YouTube' }));
}
function ytEmbed(yt){
  const base = 'https://www.youtube-nocookie.com/embed/';
  const q = 'autoplay=1&rel=0&modestbranding=1';
  if (yt.type === 'playlist') return `${base}videoseries?list=${yt.id}&${q}`;
  if (yt.type === 'uploads') return `${base}videoseries?list=UU${yt.id.slice(2)}&${q}`;
  if (yt.type === 'live') return `${base}live_stream?channel=${yt.id}&${q}`;
  return `${base}${yt.id}?${q}`;
}
function ytPage(yt){
  if (yt.type === 'playlist') return 'https://www.youtube.com/playlist?list=' + yt.id;
  if (yt.type === 'video') return 'https://www.youtube.com/watch?v=' + yt.id;
  return 'https://www.youtube.com/channel/' + yt.id + (yt.type === 'live' ? '/live' : '/videos');
}
async function showYouTube(it, mode){
  const box = $('#pYt');
  box.style.display = 'block'; video.style.display = 'none';
  let yt = it.yt;
  if (yt.type === 'path'){
    box.innerHTML = '<div class="pmsg show" style="position:absolute"><div class="spinner"></div>Buscando el canal…</div>';
    try { yt = { type: 'live', id: await resolveYtPath(yt.path) }; }
    catch(e){
      box.innerHTML = `<div class="pmsg show" style="position:absolute"><b>Este canal se abre en YouTube.</b><p style="color:#aab">${android ? 'No se pudo encontrar el canal.' : 'En el navegador no se puede abrir aquí; en la app Android sí.'}</p><a class="btn" href="https://www.youtube.com/${esc(yt.path.replace(/\/live$/, ''))}/live" target="_blank" rel="noopener">Abrir en YouTube</a></div>`;
      return;
    }
    if (S.current && S.current.items[S.current.index] !== it) return;
  }
  const show = mode === 'uploads' && yt.type === 'live' ? { type: 'uploads', id: yt.id } : yt;
  box.innerHTML = `<iframe src="${esc(ytEmbed(show))}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
    <div class="ytopen row">${yt.type === 'live' ? `<button class="btn ghost small" id="ytMode">${show.type === 'live' ? '📼 Últimos videos' : '● Ver en vivo'}</button>` : ''}<a class="btn ghost small" href="${esc(ytPage(show))}" target="_blank" rel="noopener">Abrir en YouTube</a></div>`;
  const b = $('#ytMode'); if (b) b.onclick = () => showYouTube(it, show.type === 'live' ? 'uploads' : 'live');
  if (yt.type === 'live' && show.type === 'live') toast('Si no está transmitiendo ahora, toca “Últimos videos”');
  hideMsg();
}
function hideYouTube(){ const b = $('#pYt'); b.innerHTML = ''; b.style.display = 'none'; video.style.display = ''; }

/* Interfaz de audio (radio y podcasts) */
function showAudioUI(it){
  const a = $('#pAudio');
  a.innerHTML = `<div class="aart">${it.logo || it.poster ? `<img src="${esc(it.poster || it.logo)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'📻'}))">` : '<span>📻</span>'}</div>
    <b>${esc(it.title || it.name)}</b><small>${esc(it.kind === 'radio' ? 'Radio en vivo' : it.group || 'Podcast')}</small>
    <button class="btn ghost small" id="dimBtn">🌙 Apagar pantalla</button>`;
  a.style.display = 'flex';
  $('#dimBtn').onclick = () => { $('#dim').style.display = 'block'; };
  android && android.setBackgroundAudio && android.setBackgroundAudio(true);
}
function hideAudioUI(){ $('#pAudio').style.display = 'none'; $('#dim').style.display = 'none'; android && android.setBackgroundAudio && android.setBackgroundAudio(false); }

/* =====================================================================
   Búsqueda por voz
   ===================================================================== */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function voiceAvailable(){ if (android && android.voiceSearch) return android.hasVoice ? !!android.hasVoice() : true; return !!SR; }
function startVoice(){
  if (android && android.voiceSearch){ android.voiceSearch(); return; }
  if (!SR) return;
  const r = new SR();
  r.lang = 'es-CR'; r.interimResults = false; r.maxAlternatives = 1;
  $('#micBtn').classList.add('listening');
  toast('🎤 Te escucho…');
  r.onresult = e => handleVoice(e.results[0][0].transcript);
  r.onerror = e => toast(e.error === 'not-allowed' ? 'Permite el micrófono para usar la voz' : 'No te entendí, intenta de nuevo');
  r.onend = () => $('#micBtn').classList.remove('listening');
  try { r.start(); } catch(e){ $('#micBtn').classList.remove('listening'); }
}
window.mitvVoice = text => handleVoice(text);
function handleVoice(text){
  if (!text) return;
  toast('🎤 “' + text + '”');
  const q = normName(text.replace(/^(pon(er|me)?|ver|quiero ver|abre|abrir|cambia a|canal|la radio|radio)\s+/gi, '').replace(/^(el|la|los)\s+/i, ''));
  if (!q) return;
  const pool = [...S.visible, ...P.favs, ...allKnownChannels(), ...Object.values(S.cache).filter(Array.isArray).flat().filter(i => i.kind === 'radio'), ...ytItems()];
  const nm = it => normName(it.name);
  const hit = pool.find(i => nm(i) === q) || pool.find(i => nm(i).startsWith(q)) || pool.find(i => q.length >= 4 && nm(i).includes(q));
  if (hit) return play([hit], 0);
  $('#q').value = text; S.q = text;
  if (S.tab === 'inicio') S.tab = 'vivo';
  render();
}

/* =====================================================================
   Cuenta en la nube (Firebase) y sincronización
   ===================================================================== */
const C = { idToken: null, exp: 0, es: null, rs: null, timer: null, suppress: false, pushTimer: null };
const cloud = () => S.cfg.cloud || null;
const cloudReady = () => !!(cloud() && cloud().uid && cloud().refresh);
const FB_ERR = { EMAIL_EXISTS: 'Ese correo ya tiene cuenta', EMAIL_NOT_FOUND: 'Correo o contraseña incorrectos', INVALID_PASSWORD: 'Correo o contraseña incorrectos', INVALID_LOGIN_CREDENTIALS: 'Correo o contraseña incorrectos', USER_DISABLED: 'Cuenta deshabilitada', INVALID_EMAIL: 'Correo no válido', API_KEY_INVALID: 'La clave de Firebase no es válida', OPERATION_NOT_ALLOWED: 'Activa “Correo/contraseña” en Firebase Authentication' };
async function fbAuth(apiKey, op, email, password){
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${op}?key=${encodeURIComponent(apiKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  const j = await r.json();
  if (!r.ok){ const code = ((j.error && j.error.message) || 'ERROR').split(' ')[0]; throw new Error(FB_ERR[code] || (code.startsWith('WEAK_PASSWORD') ? 'La contraseña debe tener al menos 6 caracteres' : code)); }
  return j;
}
async function fbToken(){
  const c = cloud();
  if (C.idToken && Date.now() < C.exp) return C.idToken;
  const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(c.apiKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(c.refresh) });
  const j = await r.json();
  if (!r.ok) throw new Error('sesión vencida, vuelve a iniciar sesión');
  C.idToken = j.id_token; C.exp = Date.now() + (+j.expires_in - 120) * 1000;
  if (j.refresh_token && j.refresh_token !== c.refresh){ c.refresh = j.refresh_token; C.suppress = true; saveCfg(); C.suppress = false; }
  return C.idToken;
}
async function fb(method, path, body){
  const c = cloud();
  const r = await fetch(`${c.db}/${path}.json?auth=${encodeURIComponent(await fbToken())}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401) throw new Error('sin permiso: revisa las reglas de la base de datos');
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
function syncPayload(){
  const cfg = Object.assign({}, S.cfg); delete cfg.cloud; delete cfg.homeUrl;
  const per = {};
  store.keys().filter(k => k.startsWith('P:')).forEach(k => { per[k.replace(/:/g, '~')] = store.get(k); });
  return { profiles: S.profiles, lists: S.lists, cfg, reminders: S.reminders, per, familyFavs: store.get('familyFavs', []) };
}
function applyPayload(d){
  C.suppress = true;
  try {
    store.keys().filter(k => k.startsWith('P:')).forEach(k => store.del(k));
    Object.entries(d.per || {}).forEach(([k, v]) => store.set(k.replace(/~/g, ':'), v));
    S.profiles = d.profiles && d.profiles.length ? d.profiles : S.profiles; store.set('profiles', S.profiles);
    S.lists = d.lists || []; store.set('lists', S.lists);
    S.cfg = Object.assign({}, S.cfg, d.cfg || {}, { cloud: S.cfg.cloud, homeUrl: S.cfg.homeUrl }); saveCfg();
    S.reminders = d.reminders || S.reminders; saveReminders();
    if (d.familyFavs) store.set('familyFavs', d.familyFavs);
    if (!S.profiles.some(p => p.id === S.pid)){ S.pid = S.profiles[0].id; store.set('active', S.pid); }
  } finally { C.suppress = false; }
  loadProfile();
  if (!player.classList.contains('open') && !modals.length) render();
}
function cloudDirty(k){
  if (C.suppress || !cloudReady()) return;
  if (!(k === 'profiles' || k === 'lists' || k === 'cfg' || k === 'reminders' || k === 'familyFavs' || k.startsWith('P:'))) return;
  clearTimeout(C.pushTimer);
  C.pushTimer = setTimeout(cloudPush, k.endsWith(':stats') ? 30000 : 3000);
}
async function cloudPush(){
  if (!cloudReady()) return;
  const ts = Date.now();
  try { await fb('PUT', `users/${cloud().uid}/state`, { ts, dev: devId, data: syncPayload() }); store.set('syncTs', ts); setCloudStatus('Sincronizado ' + fmtTime(new Date(ts))); }
  catch(e){ setCloudStatus('Error al sincronizar: ' + e.message); }
}
function setCloudStatus(t){ S.cloudStatus = t; const el = $('#cloudStat'); if (el) el.textContent = t; }
async function cloudStart(){
  if (!cloudReady()) return;
  try {
    const st = await fb('GET', `users/${cloud().uid}/state`);
    const local = store.get('syncTs', 0);
    if (st && st.ts > local && st.dev !== devId){ store.set('syncTs', st.ts); applyPayload(st.data || {}); setCloudStatus('Datos traídos de la nube'); }
    else if (!st || local > (st.ts || 0)) await cloudPush();
    else setCloudStatus('Sincronizado');
    await registerDevice();
    listenCloud();
  } catch(e){ setCloudStatus('Sin conexión con la nube: ' + e.message); }
}
async function listenCloud(){
  if (!cloudReady() || !window.EventSource) return;
  C.es && C.es.close(); C.rs && C.rs.close();
  const tok = await fbToken().catch(() => null); if (!tok) return;
  const c = cloud();
  C.es = new EventSource(`${c.db}/users/${c.uid}/state.json?auth=${encodeURIComponent(tok)}`);
  C.es.addEventListener('put', e => {
    try {
      const m = JSON.parse(e.data); const d = m.path === '/' ? m.data : null;
      if (d && d.ts > store.get('syncTs', 0) && d.dev !== devId){ store.set('syncTs', d.ts); applyPayload(d.data || {}); setCloudStatus('Actualizado desde otro dispositivo ' + fmtTime(new Date())); }
    } catch(err){}
  });
  C.rs = new EventSource(`${c.db}/users/${c.uid}/remote/${devId}.json?auth=${encodeURIComponent(tok)}`);
  const onCmd = e => {
    try {
      const m = JSON.parse(e.data); if (!m.data) return;
      const cmds = m.path === '/' ? Object.entries(m.data) : [[m.path.slice(1), m.data]];
      cmds.forEach(([k, cmd]) => { if (cmd && cmd.k && Date.now() - (cmd.t || 0) < 30000) execRemote(cmd); });
      fb('DELETE', `users/${c.uid}/remote/${devId}`).catch(() => {});
    } catch(err){}
  };
  C.rs.addEventListener('put', onCmd); C.rs.addEventListener('patch', onCmd);
  const again = () => { setTimeout(listenCloud, 5000); };
  C.es.addEventListener('auth_revoked', () => { C.idToken = null; again(); });
  C.es.onerror = () => { if (C.es.readyState === 2) again(); };
  clearTimeout(C.timer); C.timer = setTimeout(() => { C.idToken = null; listenCloud(); }, 50*60e3);
}
function deviceName(){
  if (S.cfg.devName) return S.cfg.devName;
  const ua = navigator.userAgent;
  if (android) return /AFT/.test(ua) ? 'Fire TV' : /TV|Leanback/i.test(ua) ? 'Android TV' : 'Android';
  return (/Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Android/.test(ua) ? 'Celular Android' : /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : 'Navegador') + ' · ' + (/Edg\//.test(ua) ? 'Edge' : /Chrome/.test(ua) ? 'Chrome' : /Firefox/.test(ua) ? 'Firefox' : 'Safari');
}
async function registerDevice(){
  if (!cloudReady()) return;
  try { await fb('PUT', `users/${cloud().uid}/devices/${devId}`, { name: deviceName(), ts: Date.now() }); } catch(e){}
}
function cloudBox(target){
  const c = cloud() || {};
  if (cloudReady()){
    target.innerHTML = `<p style="margin-top:0">Conectado como <b>${esc(c.email)}</b>. Este dispositivo: <b>${esc(deviceName())}</b>.</p>
      <p class="muted" id="cloudStat">${esc(S.cloudStatus || '')}</p>
      <div class="row"><button class="btn ghost" id="cSync">Sincronizar ahora</button><button class="btn ghost" id="cName">Cambiar nombre del dispositivo</button><button class="btn danger" id="cOut">Cerrar sesión</button></div>`;
    $('#cSync').onclick = cloudPush;
    $('#cName').onclick = () => {
      const md = openModal(`<h3>Nombre de este dispositivo</h3><input id="dn" value="${esc(deviceName())}" style="width:100%;padding:9px;border-radius:8px;border:1px solid var(--line);background:var(--bg)" autofocus><div class="actions"><button class="btn" id="dnOk">Guardar</button></div>`);
      md.querySelector('#dnOk').onclick = () => { S.cfg.devName = md.querySelector('#dn').value.trim(); saveCfg(); registerDevice(); closeModal(); render(); };
    };
    $('#cOut').onclick = () => { C.es && C.es.close(); C.rs && C.rs.close(); C.idToken = null; S.cfg.cloud = { apiKey: c.apiKey, db: c.db }; saveCfg(); render(); $('#remoteBtn').style.display = 'none'; };
    return;
  }
  target.innerHTML = `<p class="muted" style="margin-top:0">Inicia sesión para que tus perfiles, favoritos, listas y ajustes se sincronicen solos entre todos tus dispositivos, y para usar el celular como control remoto. Usa un proyecto gratuito de Firebase (las instrucciones están en el archivo LEEME).</p>
    <form id="fCloud">
      <div class="row"><div class="field"><label>Clave web de Firebase (apiKey)</label><input id="cKey" value="${esc(c.apiKey || '')}" required></div>
      <div class="field"><label>Dirección de la base de datos</label><input id="cDb" type="url" placeholder="https://tu-proyecto-default-rtdb.firebaseio.com" value="${esc(c.db || '')}" required></div></div>
      <div class="row"><div class="field"><label>Correo</label><input id="cMail" type="email" required></div><div class="field"><label>Contraseña</label><input id="cPass" type="password" required minlength="6"></div></div>
      <div class="row"><button class="btn" data-op="signInWithPassword">Iniciar sesión</button><button class="btn ghost" data-op="signUp">Crear cuenta</button></div>
    </form>`;
  let op = 'signInWithPassword';
  target.querySelectorAll('[data-op]').forEach(b => b.onclick = () => { op = b.dataset.op; });
  $('#fCloud').onsubmit = async e => {
    e.preventDefault();
    const apiKey = $('#cKey').value.trim(), db = $('#cDb').value.trim().replace(/\/+$/, '');
    try {
      const j = await fbAuth(apiKey, op, $('#cMail').value.trim(), $('#cPass').value);
      S.cfg.cloud = { apiKey, db, email: j.email, uid: j.localId, refresh: j.refreshToken };
      C.idToken = j.idToken; C.exp = Date.now() + (+j.expiresIn - 120) * 1000;
      C.suppress = true; saveCfg(); C.suppress = false;
      toast(op === 'signUp' ? 'Cuenta creada' : 'Sesión iniciada');
      await cloudStart();
      $('#remoteBtn').style.display = '';
      render();
    } catch(err){ toast(err.message); }
  };
}

/* =====================================================================
   Control remoto desde otro dispositivo
   ===================================================================== */
function execRemote(cmd){
  poke && player.classList.contains('open') && poke();
  const k = cmd.k;
  if (k.startsWith('Arrow')) return moveFocus(k);
  if (k === 'ok'){ const a = document.activeElement; if (a && a !== document.body) a.click(); else moveFocus('ArrowDown'); return; }
  if (k === 'back') return handleBack();
  if (k === 'home'){ while (modals.length) closeModal(); if (player.classList.contains('open')) closePlayer(); S.tab = 'inicio'; return render(); }
  if (k === 'chup') return player.classList.contains('open') ? step(-1) : null;
  if (k === 'chdown') return player.classList.contains('open') ? step(1) : null;
  if (k === 'playch'){ try { const it = JSON.parse(cmd.v); toast('Recibido: ' + it.name); play([it], 0); } catch(e){} return; }
  if (k === 'last') return prevChannel();
  if (k === 'pp'){ if (video.paused) video.play().catch(() => {}); else video.pause(); return; }
  if (k === 'mute'){ video.muted = !video.muted; return toast(video.muted ? 'Silenciado' : 'Sonido activado'); }
  if (k === 'volup' || k === 'voldown'){ video.volume = Math.min(1, Math.max(0, video.volume + (k === 'volup' ? .1 : -.1))); return toast('Volumen ' + Math.round(video.volume * 100) + '%'); }
  if (/^\d$/.test(k)) return zapDigit(k);
  if (k === 'voice') return handleVoice(cmd.v || '');
}
async function openRemote(){
  if (!cloudReady()){ toast('Inicia sesión en la nube (Ajustes) para usar el control remoto'); return; }
  let devs = {};
  try { devs = await fb('GET', `users/${cloud().uid}/devices`) || {}; } catch(e){ toast(e.message); return; }
  const list = Object.entries(devs).filter(([id]) => id !== devId).sort((a, b) => b[1].ts - a[1].ts);
  if (!list.length){ toast('No hay otros dispositivos. Inicia sesión con la misma cuenta en tu TV.'); return; }
  let target = store.get('remoteTarget', list[0][0]);
  if (!devs[target]) target = list[0][0];
  const md = openModal(`<h3>📱 Control remoto</h3>
    <div class="field"><label>Controlar</label><select id="rmDev">${list.map(([id, d]) => `<option value="${id}" ${id === target ? 'selected' : ''}>${esc(d.name)} · visto ${fmtTime(new Date(d.ts))}</option>`).join('')}</select></div>
    <div class="remote">
      <div class="rgrid">
        <button data-k="back">↩ Atrás</button><button data-k="ArrowUp">▲</button><button data-k="home">⌂ Inicio</button>
        <button data-k="ArrowLeft">◀</button><button data-k="ok" class="okb">OK</button><button data-k="ArrowRight">▶</button>
        <button data-k="chup">CH +</button><button data-k="ArrowDown">▼</button><button data-k="volup">VOL +</button>
        <button data-k="chdown">CH −</button><button data-k="pp">⏯</button><button data-k="voldown">VOL −</button>
        <button data-k="last">⇄ Anterior</button><button data-k="mute">🔇</button><button data-k="0">0</button>
      </div>
      <div class="rnum">${[1,2,3,4,5,6,7,8,9].map(n => `<button data-k="${n}">${n}</button>`).join('')}</div>
      <form id="rmSay" class="row" style="margin-top:10px"><div class="field" style="margin:0"><input id="rmText" placeholder="Escribe un canal o radio para ponerlo"></div><button class="btn">Poner</button></form>
    </div>
    <div class="actions"><button class="btn ghost" id="rmNo">Cerrar</button></div>`);
  const send = async (k, v) => {
    const t = md.querySelector('#rmDev').value; store.set('remoteTarget', t);
    try { await fb('POST', `users/${cloud().uid}/remote/${t}`, { k, v: v || '', t: Date.now() }); if (navigator.vibrate) navigator.vibrate(15); }
    catch(e){ toast('No se pudo enviar: ' + e.message); }
  };
  md.querySelector('.remote').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b){ e.preventDefault(); send(b.dataset.k); } });
  md.querySelector('#rmSay').onsubmit = e => { e.preventDefault(); const v = md.querySelector('#rmText').value.trim(); if (v){ send('voice', v); md.querySelector('#rmText').value = ''; } };
  md.querySelector('#rmNo').onclick = () => closeModal();
}

/* =====================================================================
   Fuentes adicionales de canales
   ===================================================================== */
const FREE_TV = 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8';
const FTV_GROUP = { cr: 'Costa Rica', mx: 'Mexico', ar: 'Argentina', cl: 'Chile', pe: 'Peru', ve: 'Venezuela', py: 'Paraguay', do: 'Dominican Republic', spa: 'News (ES)' };
// Transmisiones oficiales en YouTube (ID del canal confirmado)
const YT_OFFICIAL = {
  cr: [
    { name: 'Teletica · en vivo por YouTube', id: 'UCOC6n5gbktagxIUrQrp42yw' },
    { name: 'Noticias Repretel · en vivo por YouTube', id: 'UCr6TeVofbyCvtCdxV_niQKQ' },
    // 3.11: televisión pública, Multimedios y Asamblea Legislativa (canales oficiales)
    { name: 'Canal 13 SINART · en vivo por YouTube', id: 'UC71S1G67Z4Rm3H_PxNVrVjA', group: 'General', logoTxt: '13' },
    { name: 'Multimedios Canal 8 · en vivo por YouTube', id: 'UCILU2ghO8GrOeB-zo93eYdA', group: 'News' },
    { name: 'Asamblea Legislativa · en vivo por YouTube', id: 'UCWN0rIWneMdqRmZ4yHs5GuA', group: 'News' },
    { name: 'Asamblea Legislativa · sesiones y comisiones', id: 'UC2Ho5Sgxob7xBKGe5Vgjp8g', group: 'News' }
  ]
};
const isIpHost = u => { try { return /^\d{1,3}(\.\d{1,3}){3}$/.test(new URL(u).hostname); } catch(e){ return true; } };
async function freeTvGroup(cc){
  const group = FTV_GROUP[cc]; if (!group) return [];
  let all;
  try { all = await loadRemote(FREE_TV); } catch(e){ return []; }
  delete all.epg; // sus guías son archivos enormes: no cargarlas
  const inGroup = all.filter(i => (i.group || '') === group);
  // Enlaces repetidos para varios canales distintos no son confiables
  const count = {}; inGroup.forEach(i => { count[i.url] = (count[i.url] || 0) + 1; });
  return inGroup.filter(i => count[i.url] === 1 && !isIpHost(i.url)).map(i => {
    let name = i.name.replace(/[ⓈⓎⓖⒼ]/g, '').trim();
    const geo = /Ⓖ/.test(i.name);
    const yt = i.url.match(/youtube\.com\/(@[\w.-]+|c\/[\w.-]+|user\/[\w.-]+|channel\/UC[\w-]{22})/);
    const base = { name: geo ? name + ' · solo en su país' : name, logo: i.logo, id: i.id, group: cc === 'spa' ? 'News' : 'General', src: 'Free-TV' };
    if (yt) return Object.assign(base, { kind: 'youtube', url: 'yt:path:' + yt[1], yt: yt[1].startsWith('channel/') ? { type: 'live', id: yt[1].slice(8) } : { type: 'path', path: yt[1] }, group: 'YouTube' });
    return Object.assign(base, { url: i.url });
  });
}
function officialYt(cc){
  return (YT_OFFICIAL[cc] || []).map(y => ({ name: y.name, kind: 'youtube', url: 'yt:live:' + y.id, yt: { type: 'live', id: y.id }, group: y.group || 'YouTube', src: 'YouTube oficial' }));
}
// Une la lista principal con las adicionales: mismo canal → enlace alterno de respaldo
const baseName = n => normName(String(n).replace(/·.*$/, '').replace(/\b(hd|sd|tv|canal|television|televisión)\b/gi, ''));
function mergeSources(primary, extras){
  const out = primary.map(i => Object.assign({}, i));
  const byName = new Map(); out.forEach(i => { const k = baseName(i.name); if (k && !byName.has(k)) byName.set(k, i); });
  const urls = new Set(out.map(i => i.url));
  for (const e of extras){
    if (urls.has(e.url)) continue;
    const k = baseName(e.name), hit = k && byName.get(k);
    if (hit && e.kind !== 'youtube' && hit.kind !== 'youtube'){ (hit.alts = hit.alts || []).push(e.url); }
    else { out.push(e); if (k) byName.set(k, e); }
    urls.add(e.url);
  }
  return out;
}
async function countryItems(cc){
  const primary = await loadRemote(countryUrl(cc));
  const extra = [...await freeTvGroup(cc), ...officialYt(cc)];
  const custom = cc === 'cr' ? customItems('tv') : [];
  return mergeSources(primary, [...extra, ...custom]);
}

/* Enlace que se está usando (principal o alterno que sí funciona) */
const playUrl = it => it._url || (S.health[hk(it)] && S.health[hk(it)].alt) || it.url;
function tryAlt(it){
  const all = [it.url, ...(it.alts || [])];
  const tried = it._tried || (it._tried = new Set([playUrl(it)]));
  const next = all.find(u => !tried.has(u));
  if (!next) return false;
  tried.add(next); it._url = next;
  return true;
}

/* YouTube: obtener el ID de un canal a partir de su @nombre (solo en la app Android) */
async function resolveYtPath(path){
  const ck = 'ytid:' + path.toLowerCase();
  const c = store.get(ck, null); if (c) return c;
  if (!android) throw new Error('solo en la app Android');
  const html = await fetchText('https://www.youtube.com/' + path.replace(/\/live$/, ''));
  const m = html.match(/"(?:externalId|channelId|browseId)":"(UC[\w-]{22})"/) || html.match(/youtube\.com\/channel\/(UC[\w-]{22})/);
  if (!m) throw new Error('no se encontró el canal');
  store.set(ck, m[1]);
  return m[1];
}

/* =====================================================================
   Canales y radios propios
   ===================================================================== */
function addCustom(name, url, kind){
  if (!name || !/^https?:\/\//i.test(url)){ toast('Revisa el nombre y el enlace'); return; }
  S.cfg.custom = [...(S.cfg.custom || []), { name, url, kind: kind === 'radio' ? 'radio' : 'tv', logo: '' }];
  saveCfg(); toast(kind === 'radio' ? 'Radio agregada a Mis radios' : 'Canal agregado a Costa Rica');
}
function customItems(kind){
  return (S.cfg.custom || []).filter(c => c.kind === kind).map(c => Object.assign({}, c, { group: c.kind === 'radio' ? 'Mi radio' : 'Mis canales', mine: true }));
}

/* =====================================================================
   Diagnóstico de canales
   ===================================================================== */
async function runDiagnosis(list){
  const items = list.filter(i => !noProbe(i));
  if (!items.length){ toast('No hay canales para revisar'); return; }
  let stop = false;
  const md = openModal(`<h3>🩺 Diagnóstico de canales</h3>
    <p class="muted" style="margin-top:0">Revisa cada canal desde este dispositivo: la lista, la calidad y el primer pedazo de video. Puede tardar un par de minutos.</p>
    <p id="dgProg"><b>0</b> de ${items.length}</p><div id="dgSum"></div><div id="dgList" style="max-height:42vh;overflow:auto;font-size:13px"></div>
    <div class="actions"><button class="btn ghost" id="dgCopy" disabled>Copiar informe</button><button class="btn" id="dgNo" autofocus>Cerrar</button></div>`,
    { onClose: () => { stop = true; } });
  md.querySelector('#dgNo').onclick = () => closeModal();
  const res = [], queue = items.map((it, i) => [it, i]);
  let done = 0;
  const order = ['ok', 'offline', 'cors', 'mixed', 'headers', 'denied', 'segment', 'html', 'timeout', 'down'];
  const draw = () => {
    md.querySelector('#dgProg').innerHTML = done < items.length ? `<b>${done}</b> de ${items.length} revisados…` : `<b>Listo:</b> ${items.length} canales revisados desde ${esc(deviceName())}.`;
    const cnt = {}; res.forEach(r => { if (r) cnt[r.why] = (cnt[r.why] || 0) + 1; });
    md.querySelector('#dgSum').innerHTML = order.filter(k => cnt[k]).map(k => `<div class="hbar" style="grid-template-columns:1fr 50px"><span><span class="dot ${k === 'ok' ? 'ok' : APP_ONLY.includes(k) ? 'warn' : 'down'}" style="position:static;display:inline-block;margin-right:6px"></span>${esc(WHY[k])}</span><b>${cnt[k]}</b></div>`).join('');
    md.querySelector('#dgList').innerHTML = res.map((r, i) => r && r.why !== 'ok' ? `<div class="list-item"><div class="grow"><b>${esc(items[i].name)}</b><small>${esc(WHY[r.why] || r.why)}${r.code ? ' · código ' + r.code : ''}</small></div></div>` : '').join('');
  };
  const worker = async () => {
    while (queue.length && !stop){
      const [it, i] = queue.shift();
      const r = await probe(it, true).catch(() => ({ why: 'down' }));
      res[i] = r; done++;
      S.health[hk(it)] = { ok: r.why === 'ok', why: r.why, code: r.code, alt: r.alt, t: Date.now() };
      draw();
    }
  };
  await Promise.all(Array.from({ length: LITE ? 2 : 4 }, worker));
  if (stop) return;
  store.set('health', S.health);
  const btn = md.querySelector('#dgCopy'); btn.disabled = false;
  const report = `Diagnóstico MiTV ${APP_VERSION} · ${deviceName()} · ${new Date().toLocaleString('es-CR')}\n` +
    items.map((it, i) => `${res[i].why === 'ok' ? 'OK ' : 'XX '} ${it.name} | ${res[i].why}${res[i].code ? ' ' + res[i].code : ''}${res[i].alt ? ' (enlace alterno)' : ''} | ${res[i].alt || it.url}`).join('\n');
  btn.onclick = async () => {
    try { await navigator.clipboard.writeText(report); toast('Informe copiado'); }
    catch(e){ md.querySelector('#dgList').innerHTML = `<textarea style="width:100%;height:200px;font-size:11px" readonly>${esc(report)}</textarea>`; toast('Selecciónalo y cópialo'); }
  };
  if (S.tab === 'vivo' || S.tab === 'deportes') render();
}

/* =====================================================================
   Ajustes adicionales
   ===================================================================== */
function ajustesExtra(target){
  const kidsProfiles = S.profiles.filter(p => p.kids);
  const st = P.stats;
  const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - 6 + i); const k = d.toLocaleDateString('sv'); return [d.toLocaleDateString('es-CR', { weekday: 'short' }), st.day[k] || 0]; });
  const maxD = Math.max(1, ...days.map(d => d[1]));
  const topCh = Object.entries(st.ch).sort((a, b) => b[1].s - a[1].s).slice(0, 8);
  const maxC = Math.max(1, ...topCh.map(c => c[1].s));
  const topCat = Object.entries(st.cat).sort((a, b) => b[1] - a[1]).slice(0, 6);
  target.innerHTML = `
  <div id="aj4"></div>
  <div class="box"><h3>Inicio y reproducción</h3>
    <label class="switch"><input type="checkbox" id="resLast" ${S.cfg.resumeLast ? 'checked' : ''}> Al abrir la app, poner el último canal</label>
    <label class="switch"><input type="checkbox" id="tick" ${S.cfg.ticker ? 'checked' : ''}> Mostrar marcadores en vivo mientras veo TV</label>
  </div>

  <div class="box"><h3>Agenda deportiva</h3><p class="muted" style="margin-top:0">Ligas que aparecen en la agenda, en Inicio y en los marcadores.</p>
    <div class="checks" id="lgs">${LEAGUES.map(([s, n, i]) => `<label><input type="checkbox" value="${s}" ${(S.cfg.leagues || DEFAULT_LEAGUES).includes(s) ? 'checked' : ''}> ${i} ${esc(n)}</label>`).join('')}</div></div>

  <div class="box"><h3>Recordatorios</h3><div id="remList"></div></div>

  <div class="box"><h3>⏺ Grabaciones</h3><div id="recBox"></div></div>

  <div class="box"><h3>Mis canales y radios</h3>
    <p class="muted" style="margin-top:0">Agrega cualquier transmisión que encuentres, por ejemplo el enlace “en vivo” de la página oficial de un canal o una radio. Los canales aparecen en <b>En vivo → Costa Rica</b> y las radios en <b>Radio → Mis radios</b>.</p>
    <form id="fCustom" class="row"><div class="field" style="max-width:200px"><input id="cuName" placeholder="Nombre" required></div><div class="field"><input id="cuUrl" type="url" placeholder="Enlace (.m3u8, .mp3, etc.)" required></div>
      <div class="field" style="max-width:130px"><select id="cuKind"><option value="tv">Canal de TV</option><option value="radio">Radio</option></select></div><button class="btn">Agregar</button></form>
    <div id="cuList"></div></div>

  <div class="box"><h3>Canales de YouTube</h3>
    <p class="muted" style="margin-top:0">Pega el enlace de un canal (con su ID que empieza con UC), una lista de reproducción o un video en vivo.</p>
    <form id="fYt" class="row"><div class="field" style="max-width:200px"><input id="ytName" placeholder="Nombre" required></div><div class="field"><input id="ytUrl" placeholder="https://www.youtube.com/channel/UC…" required></div>
      <label class="switch"><input type="checkbox" id="ytLive"> Es transmisión en vivo</label><button class="btn">Agregar</button></form>
    <div id="ytList"></div></div>

  <div class="box"><h3>☁️ Cuenta en la nube</h3><div id="cloudBox"></div></div>

  ${kidsProfiles.length ? `<div class="box"><h3>Tiempo de pantalla infantil</h3><p class="muted" style="margin-top:0">Minutos por día (0 = sin límite). Al terminar se pide el PIN.</p>
    ${kidsProfiles.map(p => `<div class="row"><span style="min-width:120px">${esc(p.name)} 🧸</span><div class="field" style="max-width:140px;margin:0"><input type="number" min="0" max="600" step="5" data-lim="${p.id}" value="${p.limitMin || 0}"></div></div>`).join('')}</div>` : ''}

  <div class="box"><h3>📊 Estadísticas de ${esc(profile().name)}</h3>
    <p style="margin-top:0">Hoy: <b>${fmtMins(todaySecs())}</b></p>
    <div class="bars">${days.map(([n, s]) => `<div class="bar"><i style="height:${Math.max(2, s / maxD * 100)}%"></i><small>${esc(n)}</small><small class="muted">${s ? Math.round(s/60) + 'm' : ''}</small></div>`).join('')}</div>
    ${topCh.length ? '<p class="muted">Lo más visto</p>' + topCh.map(([u, c]) => `<div class="hbar"><span>${esc(c.n)}</span><i style="width:${(c.s / maxC * 100).toFixed(0)}%"></i><small>${fmtMins(c.s)}</small></div>`).join('') : '<p class="muted">Todavía no hay datos.</p>'}
    ${topCat.length ? '<p class="muted">Categorías favoritas: ' + topCat.map(([c, s]) => esc(catName(c[0].toUpperCase() + c.slice(1))) + ' (' + fmtMins(s) + ')').join(', ') + '</p>' : ''}
    ${topCh.length ? '<button class="btn danger small" id="clrStats">Borrar estadísticas</button>' : ''}
  </div>

  <div class="box"><h3>Versión y actualizaciones</h3>
    <p style="margin-top:0">MiTV ${APP_VERSION}${android ? ' para Android' : ''}.</p>
    <form id="fHome" class="row"><div class="field"><label>Dirección de tu página publicada (para buscar actualizaciones)</label><input id="homeIn" type="url" placeholder="https://tu-usuario.github.io/mitv/" value="${esc(S.cfg.homeUrl || homeUrl())}"></div><button class="btn ghost">Guardar</button></form>
    <button class="btn" id="updChk">Buscar actualizaciones</button>
  </div>`;

  ajustesExtra4($('#aj4'));
  $('#resLast').onchange = e => { S.cfg.resumeLast = e.target.checked; saveCfg(); };
  $('#tick').onchange = e => { S.cfg.ticker = e.target.checked; saveCfg(); };
  $('#lgs').onchange = () => { S.cfg.leagues = [...target.querySelectorAll('#lgs input:checked')].map(i => i.value); saveCfg(); };
  const rl = $('#remList');
  rl.innerHTML = S.reminders.length ? S.reminders.slice().sort((a, b) => a.at - b.at).map(r => `<div class="list-item"><div class="grow"><b>🔔 ${esc(r.title)}</b><small>${new Date(r.at).toLocaleString('es-CR', { weekday: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}${r.body ? ' · ' + esc(r.body) : ''}</small></div><button class="btn danger small" data-rr="${esc(r.id)}">Quitar</button></div>`).join('')
    : '<p class="muted" style="margin:0">No tienes recordatorios. Agrégalos desde la agenda deportiva o la guía.</p>';
  rl.onclick = e => { const b = e.target.closest('[data-rr]'); if (b){ removeReminder(b.dataset.rr); render(); } };
  renderRecBox();
  const yl = $('#ytList');
  yl.innerHTML = (S.cfg.yt || []).map((y, i) => `<div class="list-item"><div class="grow"><b>▶ ${esc(y.name)}</b><small>${esc(y.type)} · ${esc(y.id)}</small></div><button class="btn danger small" data-yt="${i}">Quitar</button></div>`).join('');
  yl.onclick = e => { const b = e.target.closest('[data-yt]'); if (!b) return; S.cfg.yt.splice(+b.dataset.yt, 1); saveCfg(); render(); };
  $('#fYt').onsubmit = async e => {
    e.preventDefault();
    try {
      let p;
      try { p = parseYt($('#ytUrl').value); }
      catch(err){
        const h = $('#ytUrl').value.match(/(@[\w.-]+)/);
        if (!h || !android) throw err;
        toast('Buscando el canal…');
        p = { type: 'uploads', id: await resolveYtPath(h[1]) };
      }
      if ($('#ytLive').checked && p.type === 'uploads') p.type = 'live';
      S.cfg.yt = [...(S.cfg.yt || []), { name: $('#ytName').value.trim(), type: p.type, id: p.id }]; saveCfg(); toast('Agregado'); render();
    } catch(err){ toast(err.message); }
  };
  cloudBox($('#cloudBox'));
  const cl = $('#cuList');
  cl.innerHTML = (S.cfg.custom || []).map((c, i) => `<div class="list-item"><div class="grow"><b>${c.kind === 'radio' ? '📻' : '📺'} ${esc(c.name)}</b><small>${esc(c.url)}</small></div><button class="btn danger small" data-cu="${i}">Quitar</button></div>`).join('');
  cl.onclick = e => { const b = e.target.closest('[data-cu]'); if (!b) return; S.cfg.custom.splice(+b.dataset.cu, 1); saveCfg(); S.cache = {}; render(); };
  $('#fCustom').onsubmit = e => { e.preventDefault(); addCustom($('#cuName').value.trim(), $('#cuUrl').value.trim(), $('#cuKind').value); render(); };
  target.querySelectorAll('[data-lim]').forEach(inp => inp.onchange = async () => {
    if (!(await requirePin('PIN para cambiar el tiempo de pantalla'))){ render(); return; }
    const p = S.profiles.find(x => x.id === inp.dataset.lim); p.limitMin = Math.max(0, +inp.value || 0); store.set('profiles', S.profiles); toast('Guardado');
  });
  if ($('#clrStats')) $('#clrStats').onclick = () => { P.stats = { ch: {}, cat: {}, day: {} }; pstore.set('stats', P.stats); render(); };
  $('#fHome').onsubmit = e => { e.preventDefault(); S.cfg.homeUrl = $('#homeIn').value.trim(); saveCfg(); toast('Guardado'); };
  $('#updChk').onclick = () => checkUpdates(true);
}

/* =====================================================================
   Arranque de las funciones nuevas
   ===================================================================== */
function startup3(){
  onStoreSet = cloudDirty;
  window.mitvToast = toast;
  if (voiceAvailable()){ $('#micBtn').style.display = ''; $('#micBtn').onclick = startVoice; }
  $('#remoteBtn').onclick = openRemote;
  if (cloudReady()) $('#remoteBtn').style.display = '';
  $('#dim').onclick = () => { $('#dim').style.display = 'none'; };
  $('#pLast').onclick = prevChannel;
  $('#pBack').onclick = back30;
  $('#pLive').onclick = goLive;
  setInterval(() => { checkReminders(); checkRecordings(); }, 15000);
  checkReminders();
  // Android borra las alarmas al reiniciar el equipo: volver a programarlas al abrir la app
  if (android && android.scheduleReminder) S.reminders.filter(r => !r.notified && r.at > Date.now()).forEach(r => android.scheduleReminder(r.id, Math.max(Date.now() + 5000, r.at - 5*60e3), '🔔 ' + r.title, 'Empieza a las ' + fmtTime(new Date(r.at)) + (r.body ? ' · ' + r.body : '')));
  registerSW();
  setTimeout(hideSplash, IS_TV || LITE || navigator.webdriver ? 300 : 1400);
  setTimeout(() => checkUpdates(false), 5000);
  cloudStart();
  if (S.profiles.length > 1) S.startupPick = true; else resumeLast();
}
