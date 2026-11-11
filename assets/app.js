import { computeStats, ROUND_LABELS } from './stats.js?v=mwc4alkf';
import { loadData } from './load.js?v=mwc4alkf';
import { FORM_URL } from './config.js?v=mwc4alkf';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n, d = 0) => (n === null || n === undefined ? '–' : n.toLocaleString('nl-BE', { minimumFractionDigits: d, maximumFractionDigits: d }));
const longDate = (iso) => new Date(iso + 'T12:00').toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = (iso) => new Date(iso + 'T12:00').toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' });

let data, stats, colorOf, dayIndex, sheet;

// Score (0-100) → stap op de blauwe ramp; donkere stappen krijgen witte tekst.
function cellStyle(t) {
  const step = Math.max(1, Math.min(7, Math.round(1 + Math.max(0, Math.min(1, t)) * 6)));
  return `background:var(--q${step});color:${step >= 4 ? '#fff' : '#0b0b0b'}`;
}
const scoreT = (s) => (s >= 100 ? 1 : (s - 50) / 55);

function renderHeader() {
  const n = stats.days.length;
  $('#subtitle').textContent = `${data.players.join(' · ')} — ${n} ${n === 1 ? 'dag' : 'dagen'} gespeeld`;
  if (['localhost', '127.0.0.1'].includes(location.hostname)) $('#admin-link').hidden = false;
  if (FORM_URL) { $('#form-link').href = FORM_URL; $('#form-link').hidden = false; }
  const notes = [];
  if (sheet?.error) notes.push('De scores uit het formulier konden niet geladen worden. Probeer later opnieuw.');
  for (const s of sheet?.skipped ?? []) notes.push(`Niet meegeteld uit het formulier: ${s}`);
  $('#sheet-notes').innerHTML = notes.map((n) => `<div>⚠ ${esc(n)}</div>`).join('');
  $('#sheet-notes').hidden = !notes.length;
}

function renderKpis() {
  const leader = stats.table[0];
  const leaders = stats.table.filter((r) => r.wins === leader?.wins && r.wins > 0);
  const tiles = [
    {
      label: 'Leider',
      value: leaders.length ? leaders.map((r) => r.player).join(' & ') : '–',
      sub: leaders.length ? `${leader.wins} ${leader.wins === 1 ? 'dagwinst' : 'dagwinsten'}` : 'Nog geen wins',
    },
    {
      label: 'Hoogste score ooit',
      value: stats.highest ? fmt(stats.highest.total) : '–',
      sub: stats.highest ? `${stats.highest.player} · ${shortDate(stats.highest.date)}` : '',
    },
    {
      label: 'Spannendste dag',
      value: stats.closest ? `${stats.closest.margin} ${stats.closest.margin === 1 ? 'punt' : 'punten'}` : '–',
      sub: stats.closest ? `${stats.closest.winners[0]} won op ${shortDate(stats.closest.date)}` : '',
    },
    {
      label: 'Grootste overwinning',
      value: stats.biggest ? `${stats.biggest.margin} punten` : '–',
      sub: stats.biggest ? `${stats.biggest.winners[0]} op ${shortDate(stats.biggest.date)}` : '',
    },
  ];
  $('#kpis').innerHTML = tiles.map((t) => `
    <div class="card kpi"><div class="label">${t.label}</div><div class="value">${esc(t.value)}</div><div class="sub">${esc(t.sub)}</div></div>`).join('');
}

function renderDay() {
  const el = $('#day');
  if (!stats.days.length) { el.innerHTML = '<div class="empty">Nog geen resultaten.</div>'; return; }
  const d = stats.days[dayIndex];
  const locs = d.locations ?? [];
  const heads = ROUND_LABELS.map((l, i) => `<div title="${esc(locs[i] || l)}">${locs[i]
    ? `<span class="loc-head">${esc(locs[i].split(',')[0])}</span><br><span class="loc-mult">${l.split(' ')[1]}</span>`
    : l}</div>`).join('');
  const bestAcc = Math.max(...d.ranked.map((r) => r.accuracy));
  const rows = d.ranked.map((r) => `
    <div class="row${r.isWinner ? ' winner' : ''}">
      <div class="rank">${r.isWinner ? '👑' : r.rank}</div>
      <div class="pname"><i class="dot" style="background:${colorOf(r.player)}"></i><span>${esc(r.player)}</span></div>
      ${r.rounds.map((v) => `<div class="cell" style="${cellStyle(scoreT(v))}">${v}</div>`).join('')}
      <div class="total">${r.total}${r.gap ? `<span class="gap">−${r.gap}</span>` : ''}</div>
      <div class="acc${r.accuracy === bestAcc ? ' top' : ''}" title="Zonder multipliers: (som van de 5 rondes) × 2">${r.accuracy === bestAcc ? '🎯 ' : ''}${r.accuracy}</div>
    </div>`).join('');
  const chat = (d.chat ?? []).length ? `
    <details class="chat"><summary>💬 Chat van de dag (${d.chat.length})</summary>
      <div class="msgs">${d.chat.map((m) => `<div class="msg"><b style="color:${m.player ? 'var(--text)' : 'var(--muted)'}">${esc(m.player || '?')}</b>${esc(m.text)}</div>`).join('')}</div>
    </details>` : '';
  const winText = d.winners.length > 1 ? `Gedeelde winst: ${d.winners.join(' & ')}` : `Winnaar: ${d.winners[0]}`;
  el.innerHTML = `
    <div class="day-head">
      <div><h3>${longDate(d.date)}</h3><div class="small muted">${esc(winText)} · ${d.ranked.length} gespeeld</div></div>
      <div class="day-nav">
        <button id="prev" aria-label="Vorige dag" ${dayIndex === 0 ? 'disabled' : ''}>‹</button>
        <button id="next" aria-label="Volgende dag" ${dayIndex === stats.days.length - 1 ? 'disabled' : ''}>›</button>
      </div>
    </div>
    <div class="ranking">
      <div class="row head"><div></div><div>Speler</div>${heads}
        <div style="text-align:right" title="Eindscore mét multipliers">Score<br><span class="loc-mult">op 1000</span></div>
        <div style="text-align:right" title="Score zónder multipliers: elke locatie telt even zwaar">Accuraat.<br><span class="loc-mult">op 1000</span></div>
      </div>
      ${rows}
    </div>
    ${d.missing.length ? `<div class="missing">Niet gespeeld: ${esc(d.missing.join(', '))}</div>` : ''}
    ${chat}`;
  $('#prev').onclick = () => { dayIndex--; renderDay(); };
  $('#next').onclick = () => { dayIndex++; renderDay(); };
}

function renderStandings() {
  const maxWins = Math.max(1, ...stats.table.map((r) => r.wins));
  const rows = stats.table.map((r, i) => `
    <tr>
      <td class="muted">${i + 1}</td>
      <td class="player"><span class="pname"><i class="dot" style="background:${colorOf(r.player)}"></i>${esc(r.player)}</span></td>
      <td><span class="winbar">${r.wins ? `<i style="width:${(r.wins / maxWins) * 60}px"></i>` : ''}<b>${r.wins}</b></span></td>
      <td>${r.played}</td>
      <td>${r.played ? fmt(r.winRate * 100) + '%' : '–'}</td>
      <td>${fmt(r.avg, 1)}</td>
      <td>${fmt(r.rawAvg, 1)}</td>
      <td>${r.best ? r.best.total : '–'}</td>
      <td>${r.podiums}</td>
      <td>${r.perfects}</td>
      <td>${r.bestStreak}</td>
    </tr>`).join('');
  const head = [
    ['#', ''],
    ['Speler', ''],
    ['Dagwinsten', 'Aantal dagen gewonnen (gedeelde winst telt voor iedereen)'],
    ['Gespeeld', 'Aantal dagen meegespeeld'],
    ['Win %', 'Percentage gespeelde dagen gewonnen'],
    ['Gem. score<br><span>mét multipliers · op 1000</span>', 'Gemiddelde eindscore, zoals MapTap telt (×1 ×1 ×2 ×3 ×3)'],
    ['Gem. accuraatheid<br><span>zonder multipliers · op 1000</span>', 'Gemiddelde score als elke locatie even zwaar telt: (som van de 5 rondes) × 2'],
    ['Beste score<br><span>op 1000</span>', 'Hoogste eindscore ooit'],
    ['Top 3', 'Aantal keer in de top 3 van de dag'],
    ['Rondes<br><span>op 100</span>', 'Aantal rondes met een perfecte 100'],
    ['Langste<br><span>winreeks</span>', 'Meeste dagwinsten op rij'],
  ];
  $('#standings').innerHTML = `
    <table class="standings">
      <thead><tr>${head.map(([label, tip]) => `<th${tip ? ` title="${tip}"` : ''}>${label}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// Lijngrafiek met crosshair + tooltip.
function lineChart(el, { labels, series, yMin, yMax, yTicks, format }) {
  const W = Math.max(320, el.clientWidth), H = 280;
  const m = { t: 10, r: 16, b: 28, l: 40 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const n = labels.length;
  const x = (i) => m.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v) => m.t + ih - ((v - yMin) / (yMax - yMin)) * ih;

  const grid = yTicks.map((t) => `
    <line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="var(--grid)" />
    <text x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${t}</text>`).join('');
  const every = Math.ceil(n / Math.max(1, Math.floor(iw / 64)));
  const xl = labels.map((l, i) => (i % every === 0 || i === n - 1 ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(l)}</text>` : '')).join('');
  const lines = series.map((s) => {
    let path = '', pen = false;
    s.values.forEach((v, i) => {
      if (v === null) { pen = false; return; }
      path += `${pen ? 'L' : 'M'}${x(i)},${y(v)}`; pen = true;
    });
    const dots = s.values.map((v, i) => (v === null ? '' : `<circle cx="${x(i)}" cy="${y(v)}" r="${n > 40 ? 2.5 : 4}" fill="${s.color}" stroke="var(--surface)" stroke-width="2" />`)).join('');
    return `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />${dots}`;
  }).join('');

  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Lijngrafiek">
      ${grid}
      <line x1="${m.l}" x2="${W - m.r}" y1="${y(yMin)}" y2="${y(yMin)}" stroke="var(--axis)" />
      ${xl}${lines}
      <line class="xh" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}" stroke="var(--axis)" visibility="hidden" />
      <rect x="${m.l - 10}" y="0" width="${iw + 20}" height="${H}" fill="transparent" class="hit" />
    </svg>
    <div class="tooltip"></div>`;

  const svg = el.querySelector('svg'), tip = el.querySelector('.tooltip'), xh = el.querySelector('.xh');
  const move = (ev) => {
    const pt = svg.getBoundingClientRect();
    const px = ((ev.clientX - pt.left) / pt.width) * W;
    const i = n === 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / iw) * (n - 1))));
    xh.setAttribute('x1', x(i)); xh.setAttribute('x2', x(i)); xh.setAttribute('visibility', 'visible');
    const rows = series.filter((s) => s.values[i] !== null).sort((a, b) => b.values[i] - a.values[i]);
    tip.innerHTML = `<div class="t">${esc(labels[i])}</div>` + (rows.length ? rows.map((s) =>
      `<div class="r"><span><i class="dot" style="background:${s.color}"></i>${esc(s.name)}</span><b>${format(s.values[i])}</b></div>`).join('') : '<div class="muted">Geen scores</div>');
    tip.classList.add('show');
    const left = (x(i) / W) * pt.width;
    tip.style.left = `${Math.min(Math.max(0, left + 12), pt.width - tip.offsetWidth)}px`;
    tip.style.top = '8px';
  };
  const hit = el.querySelector('.hit');
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerleave', () => { tip.classList.remove('show'); xh.setAttribute('visibility', 'hidden'); });
}

let trendMode = 'score';
function renderTrend() {
  const el = $('#trend');
  $('#trend-legend').innerHTML = data.players.map((p) => `<span><i style="background:${colorOf(p)}"></i>${esc(p)}</span>`).join('');
  if (!stats.days.length) { el.innerHTML = '<div class="empty">Nog geen resultaten.</div>'; return; }
  const labels = stats.days.map((d) => shortDate(d.date));
  if (trendMode === 'score') {
    const series = data.players.map((p) => ({
      name: p, color: colorOf(p),
      values: stats.days.map((d) => d.results.find((r) => r.player === p)?.total ?? null),
    }));
    const lo = Math.min(...series.flatMap((s) => s.values.filter((v) => v !== null)));
    const yMin = Math.max(0, Math.floor((lo - 25) / 50) * 50);
    const ticks = []; for (let t = yMin; t <= 1000; t += (1000 - yMin) > 400 ? 200 : 50) ticks.push(t);
    lineChart(el, { labels, series, yMin, yMax: 1000, yTicks: ticks, format: (v) => v });
  } else {
    const series = data.players.map((p) => {
      let c = 0;
      return { name: p, color: colorOf(p), values: stats.days.map((d) => (c += d.winners.includes(p) ? 1 : 0)) };
    });
    const max = Math.max(1, ...series.map((s) => s.values.at(-1)));
    const step = Math.max(1, Math.ceil(max / 5));
    const ticks = []; for (let t = 0; t <= max + step - 1; t += step) ticks.push(t);
    lineChart(el, { labels, series, yMin: 0, yMax: ticks.at(-1), yTicks: ticks, format: (v) => `${v} ${v === 1 ? 'win' : 'wins'}` });
  }
}

let heatMode = 'avg';
function renderHeat() {
  const el = $('#heat');
  const rows = stats.table.filter((r) => r.played);
  if (!rows.length) { el.innerHTML = '<div class="empty">Nog geen resultaten.</div>'; return; }
  const val = (r, i) => (heatMode === 'avg' ? r.roundAvg[i] : r.lostAvg[i]);
  const maxLost = Math.max(1, ...rows.flatMap((r) => r.lostAvg));
  const t = (v) => (heatMode === 'avg' ? scoreT(v) : v / maxLost);
  const cell = (v, tipText) => `<div class="c" style="${cellStyle(t(v))}" title="${esc(tipText)}">${fmt(v, heatMode === 'avg' ? 0 : 0)}</div>`;
  const group = [0, 1, 2, 3, 4].map((i) => heatMode === 'avg'
    ? stats.groupRoundAvg[i]
    : rows.reduce((s, r) => s + r.lostAvg[i] * r.played, 0) / rows.reduce((s, r) => s + r.played, 0));
  el.innerHTML = `
    <div class="heat">
      <div></div>${ROUND_LABELS.map((l) => `<div class="h">${l}</div>`).join('')}
      ${rows.map((r) => `<div class="n"><i class="dot" style="background:${colorOf(r.player)}"></i><span>${esc(r.player)}</span></div>` +
        [0, 1, 2, 3, 4].map((i) => cell(val(r, i), `${r.player} · ${ROUND_LABELS[i]}: ${heatMode === 'avg' ? 'gemiddeld ' + fmt(r.roundAvg[i], 1) : fmt(r.lostAvg[i], 1) + ' punten verloren per spel'}`)).join('')).join('')}
      <div class="sep"></div>
      <div class="n muted">Groep</div>${group.map((v, i) => cell(v, `Groep · ${ROUND_LABELS[i]}: ${fmt(v, 1)}`)).join('')}
    </div>
    <div class="scale">${heatMode === 'avg' ? 'lager' : 'minder verloren'} ${[1, 2, 3, 4, 5, 6, 7].map((s) => `<i style="background:var(--q${s})"></i>`).join('')} ${heatMode === 'avg' ? 'hoger' : 'meer verloren'}</div>
    <div class="small muted" style="margin-top:6px">${heatMode === 'avg'
      ? 'Gemiddelde ruwe score per ronde (max 100).'
      : 'Gemiddeld aantal punten dat je per spel laat liggen, mét multiplier — hier zit de winst.'}</div>`;
}

function renderLocations() {
  const el = $('#locations');
  const locs = [...stats.locations].sort((a, b) => a.avg - b.avg).slice(0, 5);
  if (!locs.length) {
    el.innerHTML = '<div class="empty">Nog geen locatienamen ingevuld. Vul ze in bij het invoeren van een dag, dan verschijnen hier de lastigste plekken.</div>';
    return;
  }
  const who = (x) => `<span class="who">${esc(x.players.join(', '))}</span> <b>${x.score}</b>`;
  el.innerHTML = `
    <table class="loc-table">
      <thead><tr><th>Locatie</th><th>Gemiddelde</th><th>Top</th><th>Laagste</th></tr></thead>
      <tbody>${locs.map((l) => `
        <tr>
          <td><b>${esc(l.name)}</b><div class="small muted">${shortDate(l.date)} · ${ROUND_LABELS[l.round]}</div></td>
          <td><span class="cell avg" style="${cellStyle(scoreT(l.avg))}">${fmt(l.avg, 0)}</span></td>
          <td>${who(l.best)}</td>
          <td>${who(l.worst)}</td>
        </tr>`).join('')}</tbody>
    </table>`;
}

function renderArchive() {
  const el = $('#archive');
  if (!stats.days.length) { el.innerHTML = '<div class="empty">Nog geen dagen.</div>'; return; }
  el.innerHTML = stats.days.map((d, i) => ({ d, i })).reverse().map(({ d, i }) => `
    <button class="li" data-i="${i}"><span>${longDate(d.date)}</span>
    <span>👑 ${esc(d.winners.join(' & '))} <b class="num">${d.ranked[0].total}</b></span></button>`).join('');
  el.querySelectorAll('button').forEach((b) => b.onclick = () => {
    dayIndex = Number(b.dataset.i); renderDay();
    $('#day').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function bindTabs(id, set) {
  document.querySelectorAll(`#${id} button`).forEach((b) => b.onclick = () => {
    document.querySelectorAll(`#${id} button`).forEach((x) => x.setAttribute('aria-selected', x === b));
    set(b.dataset.mode);
  });
}

async function main() {
  ({ data, sheet } = await loadData());
  stats = computeStats(data);
  colorOf = (p) => `var(--s${(data.players.indexOf(p) % 10) + 1})`;
  dayIndex = stats.days.length - 1;
  renderHeader(); renderKpis(); renderDay(); renderStandings(); renderTrend(); renderHeat(); renderLocations(); renderArchive();
  bindTabs('trend-tabs', (m) => { trendMode = m; renderTrend(); });
  bindTabs('heat-tabs', (m) => { heatMode = m; renderHeat(); });
  let w = innerWidth;
  addEventListener('resize', () => { if (innerWidth !== w) { w = innerWidth; renderTrend(); } });
}

main().catch((e) => {
  $('#subtitle').textContent = 'Kon data/scores.json niet laden. Open de site via een webserver (bv. "Beheer starten.cmd").';
  console.error(e);
});
