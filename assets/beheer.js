import { parseChat, parseExport, weightedTotal } from './parser.js';
import { ROUND_LABELS } from './stats.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const longDate = (iso) => new Date(iso + 'T12:00').toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const emptyLocs = () => ['', '', '', '', ''];

let data;
let groups = []; // geanalyseerde dagen uit de geplakte tekst

async function load() {
  data = await (await fetch(`data/scores.json?t=${Date.now()}`)).json();
  data.days.sort((a, b) => a.date.localeCompare(b.date));
}

async function save(statusText) {
  data.days.sort((a, b) => a.date.localeCompare(b.date));
  const res = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const out = await res.json();
  $('#save-status').innerHTML = out.ok
    ? `✅ ${esc(statusText)} — klik op <b>Publiceren</b> om het online te zetten.`
    : `❌ Opslaan mislukt: ${esc(out.error)}`;
  renderEditSelect();
}

const findDay = (date) => data.days.find((d) => d.date === date);

function setLocations(date, locs) {
  if (locs.some(Boolean)) data.locations[date] = [...locs];
  else delete data.locations[date];
}

/* ---------- MapTap-export (locaties) ---------- */

async function importExport() {
  const file = $('#export-file').files[0];
  const text = file ? await file.text() : $('#export-text').value;
  const games = parseExport(text);
  if (!games.length) { $('#export-status').textContent = '❌ Geen spellen gevonden in deze export.'; return; }
  let added = 0;
  const notes = [];
  for (const g of games) {
    const before = (data.locations[g.date] ?? []).join('|');
    setLocations(g.date, g.locations);
    if (before !== g.locations.join('|')) added++;
    // Eigen score aanvullen of controleren voor dagen die al op het scorebord staan.
    const day = findDay(g.date);
    if (!day) continue;
    const mine = day.results.find((r) => r.player === data.me);
    if (!mine) { day.results.push({ player: data.me, rounds: g.rounds, total: g.total }); notes.push(`score van ${data.me} toegevoegd op ${g.date}`); }
    else if (mine.total !== g.total) notes.push(`let op: ${g.date} staat ${mine.total} op het scorebord maar ${g.total} in de export`);
  }
  $('#export-file').value = ''; $('#export-text').value = '';
  await save(`Locaties van ${games.length} ${games.length === 1 ? 'dag' : 'dagen'} ingelezen (${added} nieuw of gewijzigd)${notes.length ? ' — ' + notes.join('; ') : ''}`);
}

/* ---------- Analyseren & voorbeeld ---------- */

function analyse() {
  const { results, messages } = parseChat($('#paste').value, { players: data.players, me: data.me });
  const dates = [...new Set([...results.map((r) => r.date), ...messages.map((m) => m.date)].filter(Boolean))].sort();
  groups = dates.map((date) => ({
    date,
    locations: [...(data.locations[date] ?? emptyLocs())],
    results: results.filter((r) => r.date === date).map((r) => ({ ...r, include: true })),
    messages: messages.filter((m) => m.date === date).map((m) => ({ ...m, include: true })),
  }));
  renderPreview();
}

function playerOptions(selected) {
  const names = [...data.players];
  if (selected && !names.includes(selected)) names.push(selected);
  return `<option value="">— kies —</option>` + names.map((p) => `<option ${p === selected ? 'selected' : ''}>${esc(p)}</option>`).join('');
}

function renderPreview() {
  const el = $('#preview');
  if (!groups.length) {
    el.innerHTML = '<section><div class="card empty">Geen MapTap-resultaten gevonden in de geplakte tekst.</div></section>';
    return;
  }
  el.innerHTML = `<section><h2>Controleren</h2>${groups.map((g, gi) => {
    const existing = findDay(g.date);
    const rows = g.results.map((r, ri) => {
      const warnings = [...r.warnings];
      if (r.player && !data.players.includes(r.player)) warnings.push(`Nieuwe speler "${r.player}" wordt toegevoegd`);
      if (existing?.results.some((x) => x.player === r.player)) warnings.push('Overschrijft bestaande score');
      return `<tr>
        <td><input type="checkbox" data-g="${gi}" data-r="${ri}" class="inc-r" ${r.include ? 'checked' : ''}></td>
        <td><select data-g="${gi}" data-r="${ri}" class="pl">${playerOptions(r.player)}</select></td>
        ${r.rounds.map((v) => `<td>${v}</td>`).join('')}
        <td><b>${r.total}</b></td>
        <td style="text-align:left">${warnings.map((w) => `<div class="warn">⚠ ${esc(w)}</div>`).join('')}</td>
      </tr>`;
    }).join('');
    const msgs = g.messages.map((m, mi) => `
      <label class="msgrow"><input type="checkbox" class="inc-m" data-g="${gi}" data-m="${mi}" ${m.include ? 'checked' : ''}>
      <b>${esc(m.player || '?')}</b><span>${esc(m.text)}</span></label>`).join('');
    return `<div class="card date-card">
      <h3 style="margin:0">${longDate(g.date)}</h3>
      ${existing ? `<div class="note">Deze dag bestaat al (${existing.results.length} scores). Nieuwe scores worden toegevoegd.</div>` : ''}
      <div class="locs">${g.locations.map((l, li) => `
        <label>${ROUND_LABELS[li]} — locatie<input type="text" class="loc" data-g="${gi}" data-l="${li}" value="${esc(l)}" placeholder="bv. Japan"></label>`).join('')}</div>
      <div class="table-wrap"><table>
        <thead><tr><th></th><th>Speler</th>${ROUND_LABELS.map((l) => `<th>${l}</th>`).join('')}<th>Totaal</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="9" class="muted">Geen scores voor deze dag</td></tr>'}</tbody>
      </table></div>
      ${g.messages.length ? `<details class="chat" open><summary>💬 Chatberichten (${g.messages.length}) — vink af wat niet op de site mag</summary><div class="msgs">${msgs}</div></details>` : ''}
    </div>`;
  }).join('')}
  <div class="actions"><button class="primary" id="save-all">💾 Opslaan</button><span class="note">Schrijft naar data/scores.json op je pc.</span></div></section>`;

  el.querySelectorAll('.inc-r').forEach((c) => c.onchange = () => { groups[c.dataset.g].results[c.dataset.r].include = c.checked; });
  el.querySelectorAll('.inc-m').forEach((c) => c.onchange = () => { groups[c.dataset.g].messages[c.dataset.m].include = c.checked; });
  el.querySelectorAll('.pl').forEach((s) => s.onchange = () => { groups[s.dataset.g].results[s.dataset.r].player = s.value; renderPreview(); });
  el.querySelectorAll('.loc').forEach((i) => i.oninput = () => { groups[i.dataset.g].locations[i.dataset.l] = i.value.trim(); });
  $('#save-all').onclick = saveGroups;
}

async function saveGroups() {
  const missing = groups.flatMap((g) => g.results).filter((r) => r.include && !r.player);
  if (missing.length) { alert('Kies eerst voor elke score een speler (of vink ze af).'); return; }
  let count = 0;
  for (const g of groups) {
    let day = findDay(g.date);
    if (!day) { day = { date: g.date, results: [], chat: [] }; data.days.push(day); }
    setLocations(g.date, g.locations);
    for (const r of g.results.filter((x) => x.include)) {
      if (!data.players.includes(r.player)) data.players.push(r.player);
      day.results = day.results.filter((x) => x.player !== r.player);
      day.results.push({ player: r.player, rounds: r.rounds, total: r.total });
      count++;
    }
    day.chat ??= [];
    for (const m of g.messages.filter((x) => x.include)) {
      if (!day.chat.some((c) => c.player === m.player && c.text === m.text)) day.chat.push({ player: m.player, text: m.text });
    }
  }
  await save(`${count} ${count === 1 ? 'score' : 'scores'} opgeslagen voor ${groups.map((g) => longDate(g.date)).join(', ')}`);
  groups = [];
  $('#paste').value = '';
  $('#preview').innerHTML = '';
}

/* ---------- Bestaande dag aanpassen ---------- */

function renderEditSelect() {
  const sel = $('#edit-date');
  const current = sel.value;
  sel.innerHTML = data.days.length
    ? [...data.days].reverse().map((d) => `<option value="${d.date}">${longDate(d.date)} (${d.results.length} scores)</option>`).join('')
    : '<option value="">Nog geen dagen</option>';
  if (current && findDay(current)) sel.value = current;
  renderEdit();
}

function renderEdit() {
  const day = findDay($('#edit-date').value);
  const el = $('#edit');
  if (!day) { el.innerHTML = ''; return; }
  const locs = [...(data.locations[day.date] ?? emptyLocs())];
  el.innerHTML = `
    <div class="locs">${locs.map((l, li) => `
      <label>${ROUND_LABELS[li]} — locatie<input type="text" class="eloc" data-l="${li}" value="${esc(l)}" placeholder="bv. Japan"></label>`).join('')}</div>
    <div class="table-wrap"><table>
      <thead><tr><th>Speler</th><th></th>${ROUND_LABELS.map((l) => `<th>${l}</th>`).join('')}<th>Totaal</th><th></th></tr></thead>
      <tbody>${day.results.map((r, ri) => `<tr><td><b>${esc(r.player)}</b></td><td></td>${r.rounds.map((v) => `<td>${v}</td>`).join('')}
        <td>${r.total}${r.total !== weightedTotal(r.rounds) ? ' <span class="warn">⚠</span>' : ''}</td>
        <td><button class="del" data-r="${ri}" title="Verwijder deze score">✕</button></td></tr>`).join('')}</tbody>
    </table></div>
    <div class="actions">
      <button class="primary" id="edit-save">💾 Wijzigingen opslaan</button>
      ${(day.chat ?? []).length ? `<button id="chat-clear">Chat van deze dag wissen (${day.chat.length})</button>` : ''}
      <button id="day-delete">Hele dag verwijderen</button>
    </div>`;
  el.querySelectorAll('.eloc').forEach((i) => i.oninput = () => { locs[i.dataset.l] = i.value.trim(); setLocations(day.date, locs); });
  el.querySelectorAll('.del').forEach((b) => b.onclick = () => {
    const r = day.results[b.dataset.r];
    if (confirm(`Score van ${r.player} (${r.total}) verwijderen?`)) { day.results.splice(b.dataset.r, 1); save(`Score van ${r.player} verwijderd`); }
  });
  $('#edit-save').onclick = () => save(`${longDate(day.date)} bijgewerkt`);
  const cc = $('#chat-clear');
  if (cc) cc.onclick = () => { if (confirm('Alle chatberichten van deze dag wissen?')) { day.chat = []; save('Chat gewist'); } };
  $('#day-delete').onclick = () => {
    if (confirm(`Hele dag ${longDate(day.date)} verwijderen?`)) { data.days = data.days.filter((d) => d !== day); save('Dag verwijderd'); }
  };
}

/* ---------- Publiceren ---------- */

async function publish() {
  const btn = $('#publish');
  btn.disabled = true; btn.textContent = 'Bezig…';
  const latest = data.days.at(-1)?.date ?? '';
  try {
    const out = await (await fetch('/api/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: `Scores ${latest}` }) })).json();
    $('#log').hidden = false;
    $('#log').textContent = out.log;
    $('#save-status').innerHTML = out.ok ? '🚀 Gepubliceerd! De site is binnen een minuutje bijgewerkt.' : '❌ Publiceren mislukt — zie log hieronder.';
  } finally {
    btn.disabled = false; btn.textContent = '🚀 Publiceren naar GitHub';
  }
}

async function main() {
  if (!['localhost', '127.0.0.1'].includes(location.hostname)) {
    document.querySelector('.wrap').innerHTML = '<div class="card">Deze pagina werkt alleen lokaal. Start <b>Beheer starten.cmd</b> op je pc.</div>';
    return;
  }
  await load();
  data.locations ??= {};
  $('#analyse').onclick = analyse;
  $('#export-import').onclick = importExport;
  $('#edit-date').onchange = renderEdit;
  $('#publish').onclick = publish;
  renderEditSelect();
}

main();
