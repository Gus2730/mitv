/* =====================================================================
   GustiTV 3.13 · Mejoras visuales: portada destacada, marcador en vivo y radio
   ===================================================================== */

/* ---------- Portada destacada en Inicio (carrusel) ---------- */
let heroTimer = null;
function heroArt(it, cls){
  return it && it.logo ? `<img class="${cls || ''}" src="${esc(it.logo)}" alt="" onerror="this.remove()">` : '';
}
function heroSlides(matches){
  const s = [];
  // 1) Partidos en vivo de tus ligas
  for (const e of (matches || []).filter(e => e.state === 'in').slice(0, 2)){
    s.push({ type: 'match', e, label: `● EN VIVO · ${e.icon} ${e.league}`, color: tileColor(e.home.name + e.away.name) });
  }
  // 2) El último canal en vivo
  if (P.lastLive) s.push({ type: 'item', it: P.lastLive, label: 'Seguir viendo', sub: nowNextLine(P.lastLive) || 'Continúa donde quedaste' });
  // 3) Tu favorito más visto (si es otro)
  const fav = P.favs.filter(f => !isVod(f) && f.kind !== 'radio' && (!P.lastLive || f.url !== P.lastLive.url))
    .sort((a, b) => ((P.stats.ch[b.url] || {}).s || 0) - ((P.stats.ch[a.url] || {}).s || 0))[0];
  if (fav) s.push({ type: 'item', it: fav, label: '⭐ Tu favorito', sub: nowNextLine(fav) || 'Toca para verlo en vivo' });
  // 4) Si no hay nada propio todavía: un canal oficial destacado del país
  if (!s.length){
    const off = officialYt(S.country === 'spa' ? 'cr' : S.country)[0] || officialYt('cr')[0];
    if (off) s.push({ type: 'item', it: off, label: '📺 Destacado', sub: 'Canal oficial en vivo' });
  }
  return s;
}
function heroSlideHTML(sl){
  if (sl.type === 'match'){
    const e = sl.e;
    const team = t => `<div class="hteam">${t.logo ? `<img src="${esc(t.logo)}" alt="" onerror="this.remove()">` : `<span class="ini">${esc(initials(t.name))}</span>`}<span>${esc(t.name)}</span></div>`;
    return `<div class="hbg" style="--tc:${sl.color}"></div>
      <div class="htext"><small class="hlive">${esc(sl.label)}</small>
        <div class="hmatch">${team(e.home)}<b class="hscore">${esc(e.home.score)} – ${esc(e.away.score)}</b>${team(e.away)}</div>
        <span class="hsub">${esc(e.detail || e.clock || '')}${e.tv.length ? ' · 📺 ' + esc(e.tv.slice(0, 2).join(', ')) : ''}</span></div>
      <span class="btn hcta">${channelForTv(e.tv) ? '▶ Ver ahora' : 'Ver detalles'}</span>`;
  }
  const it = sl.it;
  return `<div class="hbg" style="--tc:${tileColor(it.name)}">${heroArt(it, 'hblur')}</div>
    <div class="hlogo">${it.logo ? heroArt(it) : `<span class="ini">${esc(initials(it.name))}</span>`}</div>
    <div class="htext"><small>${esc(sl.label)}</small><b>${esc(it.name)}</b><span class="hsub">${esc(sl.sub || '')}</span></div>
    <span class="btn hcta">▶ Ver ahora</span>`;
}
function mountHero(matches){
  clearInterval(heroTimer);
  const old = $('#heroLast'), box0 = $('#heroBox');
  const slides = heroSlides(matches);
  if (!slides.length){ if (box0) box0.remove(); return; }
  let idx = 0;
  const html = `<button class="hero2" id="heroBox" aria-roledescription="carrusel">
      <div class="hslide">${heroSlideHTML(slides[0])}</div>
      ${slides.length > 1 ? `<div class="hdots">${slides.map((_, i) => `<i data-h="${i}" class="${i ? '' : 'on'}"></i>`).join('')}</div>` : ''}
    </button>`;
  if (box0) box0.outerHTML = html; else if (old) old.outerHTML = html;
  else { const t = content.querySelector('.topline'); if (!t) return; t.insertAdjacentHTML('afterend', html); }
  const box = $('#heroBox');
  const show = i => {
    idx = (i + slides.length) % slides.length;
    const sl = box.querySelector('.hslide');
    sl.classList.remove('hin'); void sl.offsetWidth;
    sl.innerHTML = heroSlideHTML(slides[idx]); sl.classList.add('hin');
    box.querySelectorAll('.hdots i').forEach((d, j) => d.classList.toggle('on', j === idx));
  };
  box.onclick = ev => {
    const d = ev.target.closest('[data-h]'); if (d){ ev.stopPropagation(); show(+d.dataset.h); return; }
    const sl = slides[idx];
    if (sl.type === 'match'){ const ch = channelForTv(sl.e.tv); ch ? play([ch], 0) : matchModal(sl.e); }
    else play([sl.it], 0);
  };
  let paused = false;
  box.addEventListener('mouseenter', () => paused = true); box.addEventListener('mouseleave', () => paused = false);
  box.addEventListener('focus', () => paused = true); box.addEventListener('blur', () => paused = false);
  // En la TV, con la portada enfocada, ◀ ▶ cambian de destacado
  box.addEventListener('keydown', ev => {
    if (slides.length < 2) return;
    if (ev.key === 'ArrowRight' && idx < slides.length - 1){ ev.preventDefault(); ev.stopPropagation(); show(idx + 1); }
    else if (ev.key === 'ArrowLeft' && idx > 0){ ev.preventDefault(); ev.stopPropagation(); show(idx - 1); }
  }, true);
  if (slides.length > 1) heroTimer = setInterval(() => {
    if (!document.body.contains(box)){ clearInterval(heroTimer); return; }
    if (!paused && !player.classList.contains('open') && !document.hidden) show(idx + 1);
  }, 7000);
  if (P.lastLive && P.lastLive.logo) $('#bgArt').style.backgroundImage = `url("${P.lastLive.logo.replace(/"/g, '')}")`;
}

/* ---------- Pantalla de radio ---------- */
const showAudioUI8 = showAudioUI;
showAudioUI = function(it){
  showAudioUI8(it);
  const a = $('#pAudio');
  const art = it.poster || it.logo;
  const isRadio = it.kind === 'radio';
  a.style.setProperty('--tc', tileColor(it.name));
  a.innerHTML = `<div class="abg">${art ? `<img src="${esc(art)}" alt="" onerror="this.remove()">` : ''}</div>
    <div class="aart"><span class="ini">${esc(initials(it.name))}</span>${art ? `<img src="${esc(art)}" alt="" onerror="this.remove()">` : ''}</div>
    ${isRadio ? '<span class="alive">● EN VIVO</span>' : ''}
    <b>${esc(it.title || it.name)}</b>
    <small>${esc(isRadio ? ((it.group || '').split(/[;,·]/).map(s => s.trim()).filter(Boolean).slice(0, 3).join(' · ') || 'Radio en vivo') : (it.group || 'Podcast'))}</small>
    <div class="eq" aria-hidden="true">${'<i></i>'.repeat(18)}</div>
    <div class="row arow"><button class="btn ghost small" id="aFav">${isFav(it.url) ? '★ En favoritos' : '☆ Favorito'}</button><button class="btn ghost small" id="dimBtn">🌙 Apagar pantalla</button></div>`;
  $('#dimBtn').onclick = () => { $('#dim').style.display = 'block'; };
  $('#aFav').onclick = () => { const on = !isFav(it.url); setFav(it, on); $('#aFav').textContent = on ? '★ En favoritos' : '☆ Favorito'; toast(on ? 'Agregada a favoritos' : 'Quitada de favoritos'); };
  const sync = () => a.classList.toggle('playing', !video.paused && video.readyState > 2);
  ['playing', 'pause', 'waiting', 'stalled'].forEach(ev => video.addEventListener(ev, sync));
  sync();
};

/* ---------- Envolver render: portada en Inicio ---------- */
const render8 = render;
render = function(){
  clearInterval(heroTimer);
  const r = render8.apply(this, arguments);
  if (S.tab === 'inicio'){
    mountHero([]);
    if (!profile().kids) setTimeout(() => S.tab === "inicio" && loadAgenda(0).then(ev => { if (S.tab === 'inicio' && (ev || []).some(e => e.state === 'in')) mountHero(ev); }).catch(() => {}), 2500);
  }
  return r;
};
