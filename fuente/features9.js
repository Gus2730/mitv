/* =====================================================================
   MiTV 3.14 · Continuar viendo: primero en Inicio, cuánto falta y editar
   ===================================================================== */
function leftText(pr){
  if (!pr || !pr.d) return '';
  const left = Math.max(0, Math.round((pr.d - pr.t) / 60));
  const h = Math.floor(left / 60), m = left % 60;
  return `Quedan ${h ? h + ' h ' : ''}${m} min`;
}
let contEditing = false;
function decorateContinue(){
  const box = $('#rCont'); if (!box) return;
  const title = box.previousElementSibling;
  // Llevar la fila arriba: justo después de la portada (o del saludo)
  const anchor = $('#heroBox') || content.querySelector('.topline');
  if (anchor && title && title.classList.contains('section-title') && anchor.nextElementSibling !== title){
    anchor.after(title); title.after(box);
  }
  if (title && !title.querySelector('#contEdit')){
    title.querySelector('h3').textContent = '▶ Continuar viendo';
    title.insertAdjacentHTML('beforeend', `<button class="chip" id="contEdit">${contEditing ? 'Listo' : 'Editar'}</button>`);
    title.querySelector('#contEdit').onclick = () => { contEditing = !contEditing; decorateContinue(); };
  }
  const btn = $('#contEdit'); if (btn) btn.textContent = contEditing ? 'Listo' : 'Editar';
  const grid = box.querySelector('.grid'); if (!grid || !grid._items) return;
  grid.classList.toggle('editing', contEditing);
  grid._items.forEach((it, i) => {
    const c = grid.querySelector(`.card[data-i="${i}"]`); if (!c) return;
    const g = c.querySelector('.grp'); if (g) g.textContent = (it.kind === 'podcast' ? '🎙️ ' : '') + leftText(P.progress[itemKey(it)]);
    c.setAttribute('aria-label', (contEditing ? 'Quitar ' : 'Continuar ') + (it.title || it.name));
  });
  if (!box._ed){
    box._ed = true;
    // En modo edición, tocar una tarjeta la quita de la fila (en vez de reproducirla)
    box.addEventListener('click', ev => {
      const c = ev.target.closest('.card[data-i]'); if (!c) return;
      ev.stopPropagation(); ev.preventDefault();
      const g = box.querySelector('.grid'), it = g && g._items[+c.dataset.i]; if (!it) return;
      // Fuera de Editar: retomar directo donde quedó (sin pasar por la ficha)
      if (!contEditing){ play(g._items, +c.dataset.i); return; }
      delete P.progress[itemKey(it)]; pstore.set('progress', P.progress);
      toast('Quitado de Continuar viendo');
      const rest = continueItems();
      if (!rest.length){ contEditing = false; const t = box.previousElementSibling; if (t) t.remove(); box.remove(); return; }
      renderGrid(box, rest, '', { poster: true, row: true }); decorateContinue();
      const next = box.querySelector(`.card[data-i="${Math.min(+c.dataset.i, rest.length - 1)}"]`); if (next) next.focus();
    }, true);
  }
}
const render9 = render;
render = function(){
  if (S.tab !== 'inicio') contEditing = false;
  const r = render9.apply(this, arguments);
  if (S.tab === 'inicio') decorateContinue();
  return r;
};
