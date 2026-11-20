import { loadData } from './load.js?v=mwp32fn5';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n, d = 0) => (n == null || Number.isNaN(n) ? '–' : n.toLocaleString('nl-BE', { minimumFractionDigits: d, maximumFractionDigits: d }));
const longDate = (iso) => new Date(iso + 'T12:00').toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const avg = (xs) => { const v = xs.filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

let data, days, dayIndex, colorOf;

// Hoogste score wint; bij gelijke score wint wie meer tijd over had.
const better = (a, b) => b.score - a.score || (b.spare ?? 0) - (a.spare ?? 0);

function buildDays() {
  const byDate = new Map();
  for (const g of data.gauntlet) (byDate.get(g.date) ?? byDate.set(g.date, []).get(g.date)).push(g);
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, rs]) => {
    const ranked = [...rs].sort(better);
    const top = ranked[0].score;
    return { date, ranked: ranked.map((r) => ({ ...r, isWinner: r.score === top })) };
  });
}

function renderStandings() {
  const per = new Map();
  for (const d of days) for (const r of d.ranked) {
    const s = per.get(r.player) ?? per.set(r.player, { player: r.player, played: 0, wins: 0, scores: [], locs: [], spare: [], best: null }).get(r.player);
    s.played++;
    if (r.isWinner) s.wins++;
    s.scores.push(r.score); s.locs.push(r.locations); s.spare.push(r.spare);
    if (!s.best || r.score > s.best.score) s.best = r;
  }
  const rows = [...per.values()].map((s) => ({ ...s, avg: avg(s.scores), avgLocs: avg(s.locs), avgSpare: avg(s.spare) }))
    .sort((a, b) => b.wins - a.wins || b.best.score - a.best.score);
  if (!rows.length) {
    $('#g-standings').innerHTML = '<div class="empty">Nog geen Gauntlet-scores. Plak je Gauntlet-resultaat in het formulier om te beginnen.</div>';
    return;
  }
  const maxWins = Math.max(1, ...rows.map((r) => r.wins));
  $('#g-standings').innerHTML = `<table class="standings">
    <thead><tr><th>#</th><th>Speler</th><th>Dagwinsten</th><th>Gespeeld</th><th>High score</th><th>Gem. score</th><th>Gem. locaties</th><th>Gem. tijd over</th></tr></thead>
    <tbody>${rows.map((r, i) => `<tr>
      <td>${i + 1}</td>
      <td class="player"><span class="pname"><i class="dot" style="background:${colorOf(r.player)}"></i>${esc(r.player)}</span></td>
      <td><span class="winbar">${r.wins ? `<i style="width:${(r.wins / maxWins) * 60}px"></i>` : ''}<b>${r.wins}</b></span></td>
      <td>${r.played}</td>
      <td><b>${fmt(r.best.score)}</b></td>
      <td>${fmt(r.avg, 1)}</td>
      <td>${fmt(r.avgLocs, 1)}</td>
      <td>${r.avgSpare == null ? '–' : `${fmt(r.avgSpare, 1)} s`}</td>
    </tr>`).join('')}</tbody></table>`;
}

function renderDay() {
  const el = $('#g-day');
  if (!days.length) { el.innerHTML = '<div class="empty">Nog geen Gauntlet gespeeld.</div>'; return; }
  const d = days[dayIndex];
  const missing = data.players.filter((p) => !d.ranked.some((r) => r.player === p));
  let rank = 0, prev = null;
  el.innerHTML = `
    <div class="day-head">
      <h3>${longDate(d.date)}</h3>
      <div class="day-nav">
        <button id="g-prev" ${dayIndex === 0 ? 'disabled' : ''} aria-label="Vorige dag">‹</button>
        <button id="g-next" ${dayIndex === days.length - 1 ? 'disabled' : ''} aria-label="Volgende dag">›</button>
      </div>
    </div>
    <div class="table-wrap"><table class="g-table">
      <thead><tr><th>#</th><th>Speler</th><th>Score</th><th>Locaties</th><th>Tijd</th><th>Tijd over</th></tr></thead>
      <tbody>${d.ranked.map((r, i) => {
        if (r.score !== prev) { rank = i + 1; prev = r.score; }
        return `<tr class="${r.isWinner ? 'winner' : ''}">
          <td>${r.isWinner ? '👑' : rank}</td>
          <td class="player"><span class="pname"><i class="dot" style="background:${colorOf(r.player)}"></i>${esc(r.player)}</span></td>
          <td><b>${fmt(r.score)}</b></td>
          <td>${r.locations ?? '–'}</td>
          <td>${r.time == null ? '–' : `${fmt(r.time, 1)} s`}</td>
          <td>${r.spare == null ? '–' : `${fmt(r.spare, 1)} s`}</td>
        </tr>`;
      }).join('')}</tbody></table></div>
    ${missing.length ? `<div class="missing">Niet gespeeld: ${missing.map(esc).join(', ')}</div>` : ''}`;
  $('#g-prev').onclick = () => { dayIndex--; renderDay(); };
  $('#g-next').onclick = () => { dayIndex++; renderDay(); };
}

async function main() {
  ({ data } = await loadData());
  colorOf = (p) => `var(--s${(data.players.indexOf(p) % 10) + 1})`;
  days = buildDays();
  dayIndex = days.length - 1;
  renderStandings();
  renderDay();
}

main().catch((e) => {
  $('#g-standings').innerHTML = '<div class="empty">Kon de scores niet laden.</div>';
  console.error(e);
});
