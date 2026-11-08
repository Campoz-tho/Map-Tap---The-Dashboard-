// Laadt data/scores.json en voegt de scores uit het Google Formulier (gepubliceerde sheet) toe.
import { SHEET_CSV_URL } from './config.js?v=mw7rnaav';
import { parseShare, normalizeName } from './parser.js?v=mw7rnaav';

// CSV met aanhalingstekens en meerdere regels binnen één veld.
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

// Voegt formulier-rijen toe aan data. Scores die al in scores.json staan, blijven voorrang hebben.
// Vult dezelfde speler een dag twee keer in, dan telt de laatste keer.
export function mergeSheet(data, csvText, refDate = new Date()) {
  const rows = parseCsv(csvText);
  const report = { added: 0, skipped: [] };
  if (rows.length < 2) return report;
  const head = rows[0].map((h) => h.toLowerCase());
  const col = (re, fallback) => { const i = head.findIndex((h) => re.test(h)); return i >= 0 ? i : fallback; };
  const cName = col(/naam|name|speler/, 1);
  const cText = col(/maptap|resultaat|score|result/, 2);
  const cMsg = col(/bericht|message|chat|opmerking/, -1);

  const known = new Map(data.players.map((p) => [normalizeName(p), p]));
  const fromSheet = new Map(); // "datum|speler" → resultaat
  for (const r of rows.slice(1)) {
    const rawName = (r[cName] ?? '').trim();
    if (!rawName) continue;
    const player = known.get(normalizeName(rawName)) ?? rawName;
    const res = parseShare(r[cText], refDate);
    if (!res) { report.skipped.push(`${player}: geen 5 rondescores gevonden`); continue; }
    if (!res.date) { report.skipped.push(`${player}: geen datum ("maptap.gg November 8") gevonden`); continue; }
    if (!res.ok) { report.skipped.push(`${player} (${res.date}): eindscore ${res.final} klopt niet met de rondes (${res.total})`); continue; }
    const key = `${res.date}|${player}`;
    const msg = cMsg >= 0 ? (r[cMsg] ?? '').trim() : '';
    const msgs = [...(fromSheet.get(key)?.msgs ?? []), ...(msg ? [msg] : [])];
    fromSheet.set(key, { date: res.date, player, rounds: res.rounds, total: res.total, msgs });
  }

  for (const x of fromSheet.values()) {
    let day = data.days.find((d) => d.date === x.date);
    if (!day) { day = { date: x.date, results: [], chat: [] }; data.days.push(day); }
    day.chat ??= [];
    for (const text of x.msgs) if (!day.chat.some((c) => c.player === x.player && c.text === text)) day.chat.push({ player: x.player, text });
    if (day.results.some((r) => r.player === x.player)) continue;
    if (!data.players.includes(x.player)) data.players.push(x.player);
    day.results.push({ player: x.player, rounds: x.rounds, total: x.total });
    report.added++;
  }
  data.days.sort((a, b) => a.date.localeCompare(b.date));
  return report;
}

export async function loadData() {
  const data = await (await fetch(`data/scores.json?t=${Date.now()}`)).json();
  data.locations ??= {};
  let sheet = null;
  if (SHEET_CSV_URL) {
    try {
      const url = SHEET_CSV_URL + (SHEET_CSV_URL.includes('?') ? '&' : '?') + `t=${Date.now()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      sheet = mergeSheet(data, await res.text());
    } catch (e) {
      console.warn('Formulier-scores niet geladen', e);
      sheet = { error: String(e.message ?? e), added: 0, skipped: [] };
    }
  }
  return { data, sheet };
}
