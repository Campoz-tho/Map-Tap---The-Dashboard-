import { computeStats, MIN_CONTINENT_LOCS } from './stats.js?v=mwov0h63';
import { loadData } from './load.js?v=mwov0h63';
import { CONTINENTS } from './geo.js?v=mwov0h63';
import { MAP } from './continents.js?v=mwov0h63';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => (n == null ? '–' : n.toLocaleString('nl-BE', { maximumFractionDigits: 1, minimumFractionDigits: 1 }));
const partial = (r) => (r.qualified ? '' : ` <span class="muted small" title="Telt pas mee vanaf ${MIN_CONTINENT_LOCS} locaties in dit continent">(${r.n}/${MIN_CONTINENT_LOCS})</span>`);
const ORDER = ['EU', 'AS', 'AF', 'NA', 'SA', 'OC'];

let data, stats, colorOf;

function fillFor(c) {
  if (!c?.leaders.length) return 'var(--surface-2)';
  if (c.leaders.length === 1) return colorOf(c.leaders[0]);
  return `url(#tie-${c.code})`;
}

function tieDefs() {
  return Object.values(stats.continents).filter((c) => c.leaders.length > 1).map((c) => {
    const w = 10 * c.leaders.length;
    return `<pattern id="tie-${c.code}" width="${w}" height="${w}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      ${c.leaders.map((p, i) => `<rect x="${i * 10}" width="10" height="${w}" fill="${colorOf(p)}"/>`).join('')}
    </pattern>`;
  }).join('');
}

function tipHtml(code) {
  const c = stats.continents[code];
  if (!c) return `<div class="t">${CONTINENTS[code]}</div><div class="muted">Nog geen locaties gespeeld</div>`;
  const n = c.locations.length;
  return `<div class="t">${esc(c.name)} <span class="muted" style="font-weight:400">· ${n} ${n === 1 ? 'locatie' : 'locaties'}</span></div>
    ${c.ranking.map((r) => `<div class="r${r.qualified ? '' : ' unq'}"><span><i class="dot" style="background:${colorOf(r.player)}"></i>${c.leaders.includes(r.player) ? '👑 ' : ''}${esc(r.player)}${partial(r)}</span><b>${fmt(r.avg)}</b></div>`).join('')}
    ${c.leaders.length ? '' : `<div class="muted small" style="margin-top:6px">Nog niemand heeft hier ${MIN_CONTINENT_LOCS} locaties gespeeld</div>`}
    ${c.hardest ? `<div class="muted small" style="margin-top:6px">Lastigste: ${esc(c.hardest.name)} (${fmt(c.hardest.avg)})</div>` : ''}`;
}

function renderMap() {
  const el = $('#map');
  el.innerHTML = `
    <svg viewBox="0 0 ${MAP.width} ${MAP.height}" role="img" aria-label="Wereldkaart met de leider per continent">
      <defs>${tieDefs()}</defs>
      <path d="${MAP.sphere}" class="sea"/>
      ${ORDER.map((code) => `<path d="${MAP.paths[code]}" class="cont${stats.continents[code] ? '' : ' empty'}" data-code="${code}" fill="${fillFor(stats.continents[code])}" tabindex="0"><title>${CONTINENTS[code]}</title></path>`).join('')}
    </svg>
    <div class="tooltip" id="map-tip"></div>`;

  const tip = $('#map-tip');
  const show = (path, x, y) => {
    el.querySelectorAll('.cont').forEach((p) => p.classList.toggle('active', p === path));
    tip.innerHTML = tipHtml(path.dataset.code);
    tip.classList.add('show');
    const box = el.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let left = x - box.left + 14, top = y - box.top + 14;
    if (left + tw > box.width) left = x - box.left - tw - 14;
    if (top + th > box.height) top = Math.max(0, y - box.top - th - 14);
    tip.style.left = `${Math.max(0, left)}px`;
    tip.style.top = `${top}px`;
  };
  const hide = () => { tip.classList.remove('show'); el.querySelectorAll('.cont').forEach((p) => p.classList.remove('active')); };

  el.querySelectorAll('.cont').forEach((p) => {
    p.addEventListener('pointermove', (e) => show(p, e.clientX, e.clientY));
    p.addEventListener('pointerdown', (e) => show(p, e.clientX, e.clientY));
    p.addEventListener('focus', () => { const r = p.getBoundingClientRect(); show(p, r.left + r.width / 2, r.top + r.height / 2); });
    p.addEventListener('blur', hide);
  });
  el.querySelector('svg').addEventListener('pointerleave', hide);
  el.querySelector('.sea').addEventListener('pointerdown', hide);
}

function renderLegend() {
  $('#map-legend').innerHTML = data.players.map((p) => `<span><i style="background:${colorOf(p)};height:10px;width:10px;border-radius:50%"></i>${esc(p)}</span>`).join('')
    + '<span><i style="background:var(--surface-2);height:10px;width:10px;border-radius:2px;border:1px solid var(--axis)"></i>Nog geen leider</span>';
}

function renderList() {
  $('#cont-list').innerHTML = ORDER.map((code) => {
    const c = stats.continents[code];
    if (!c) return `<div class="card cont-card"><h3>${CONTINENTS[code]}</h3><div class="empty">Nog geen locaties</div></div>`;
    const max = 100;
    return `<div class="card cont-card">
      <h3>${esc(c.name)} <span class="muted small">· ${c.locations.length} ${c.locations.length === 1 ? 'locatie' : 'locaties'}</span></h3>
      <div class="bars">${c.ranking.map((r) => `
        <div class="bar-row${c.leaders.includes(r.player) ? ' lead' : ''}${r.qualified ? '' : ' unq'}">
          <span class="pname"><i class="dot" style="background:${colorOf(r.player)}"></i><span>${c.leaders.includes(r.player) ? '👑 ' : ''}${esc(r.player)}${partial(r)}</span></span>
          <span class="bar"><i style="width:${(r.avg / max) * 100}%;background:${colorOf(r.player)}"></i></span>
          <b class="num">${fmt(r.avg)}</b>
        </div>`).join('')}</div>
      <div class="small muted" style="margin-top:8px">${c.locations.map((l) => esc(l.name.split(',')[0])).join(' · ')}</div>
    </div>`;
  }).join('');
}

async function main() {
  ({ data } = await loadData());
  stats = computeStats(data);
  colorOf = (p) => `var(--s${(data.players.indexOf(p) % 10) + 1})`;
  renderLegend(); renderMap(); renderList();
}

main().catch((e) => {
  $('#map').innerHTML = '<div class="empty">Kon data/scores.json niet laden.</div>';
  console.error(e);
});
