// Leest gekopieerde Messenger-tekst en haalt er MapTap-resultaten en chatberichten uit.
// Werkt zowel in de browser als in Node (ES module, geen afhankelijkheden).

export const MULTIPLIERS = [1, 1, 2, 3, 3];

export function weightedTotal(rounds) {
  return rounds.reduce((sum, v, i) => sum + v * MULTIPLIERS[i], 0);
}

const MONTHS = {
  january: 1, januari: 1, jan: 1,
  february: 2, februari: 2, feb: 2,
  march: 3, maart: 3, mar: 3, mrt: 3,
  april: 4, apr: 4,
  may: 5, mei: 5,
  june: 6, juni: 6, jun: 6,
  july: 7, juli: 7, jul: 7,
  august: 8, augustus: 8, aug: 8,
  september: 9, sept: 9, sep: 9,
  october: 10, oktober: 10, oct: 10, okt: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

const HEADER = /maptap\.gg\S*\s+([a-z]+)\.?\s+(\d{1,2})\b/i;
const FINAL = /final score:?\s*(\d{1,4})/i;
const TIME = /^[^\d]{0,12}\d{1,2}:\d{2}$/;
const ME_META = /^(door jou verzonden|je hebt geantwoord|je hebt gereageerd|you sent|you replied)/i;
const OTHER_META = [
  /^(.+?) heeft (?:je |op .+? )?geantwoord(?: op .+)?$/i,
  /^(.+?) heeft gereageerd/i,
  /^(.+?) replied to/i,
];
const NOISE = [
  /^🎯?\s*maptap daily geography game$/i,
  /^\[?(https?:\/\/)?(www\.)?maptap\.gg\]?(\(https?:\/\/(www\.)?maptap\.gg\/?\))?\/?$/i,
];
const NAME_LIKE = /^[\p{L}][\p{L}'’. -]{0,30}$/u;

export function normalizeName(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

function toIsoDate(month, day, refDate) {
  let year = refDate.getFullYear();
  const candidate = new Date(year, month - 1, day);
  // Datum ligt meer dan een week in de toekomst? Dan hoort ze bij vorig jaar.
  if (candidate - refDate > 7 * 864e5) year -= 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseHeader(line, refDate) {
  const m = line.match(HEADER);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  const day = Number(m[2]);
  if (!month || day < 1 || day > 31) return null;
  return toIsoDate(month, day, refDate);
}

function parseRounds(line) {
  const nums = line.match(/\d{1,3}/g);
  if (!nums || nums.length !== 5) return null;
  const rounds = nums.map(Number);
  return rounds.every((v) => v >= 0 && v <= 100) ? rounds : null;
}

// Eén gedeeld MapTap-resultaat (bv. uit het formulier):
// "maptap.gg November 8 / 93🏆 88🔥 97🔥 75😐 90👑 / Final score: 862"
export function parseShare(text, refDate = new Date()) {
  const lines = String(text ?? '').replace(/[​-‍﻿]/g, '').replace(/ /g, ' ')
    .split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let date = null, rounds = null, final = null;
  for (const line of lines) {
    if (!date) { const d = parseHeader(line, refDate); if (d) { date = d; continue; } }
    if (!rounds && !FINAL.test(line)) { const r = parseRounds(line); if (r) { rounds = r; continue; } }
    const f = line.match(FINAL);
    if (f && final === null) final = Number(f[1]);
  }
  if (!rounds) return null;
  const total = weightedTotal(rounds);
  return { date, rounds, total, final, ok: final === null || final === total };
}

function splitCsvLine(line) {
  const out = [];
  let cur = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * Leest de "Your data"-export van maptap.gg/profile:
 * datum,totaal,"locatie 1",score 1,,locatie 2,score 2,,…
 * @returns {{date: string, total: number, locations: string[], rounds: number[]}[]}
 */
export function parseExport(text) {
  const games = [];
  for (const line of text.split(/\r?\n/)) {
    const f = splitCsvLine(line);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f[0])) continue; // kopregel of lege regel
    const locations = [], rounds = [];
    for (let i = 2; i + 1 < f.length && locations.length < 5; i += 3) {
      if (!f[i]) break;
      locations.push(f[i]);
      rounds.push(Number(f[i + 1]));
    }
    if (locations.length === 5) games.push({ date: f[0], total: Number(f[1]), locations, rounds });
  }
  return games;
}

// "Round 1 · Nantes, France" (scheidingsteken mag van alles zijn; locatie mag ook op de volgende regel staan)
const MAIL_ROUND = /^round\s*([1-5])\b[^\p{L}\p{N}]*(.*)$/iu;
const MONTH_RE = Object.keys(MONTHS).join('|');
const MAIL_DATE_WEEKDAY = new RegExp(`(?:mon|tues|wednes|thurs|fri|satur|sun)day,?\\s+(${MONTH_RE})\\.?\\s+(\\d{1,2})\\b`, 'i');
const MAIL_DATE = new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})\\b`, 'i');

/**
 * Leest de dagelijkse "Today on MapTap"-mail: datum, de 5 locaties en (indien aanwezig) je eigen score.
 * Geeft ook een gedeeltelijk resultaat terug, zodat het in het controlescherm aangevuld kan worden.
 * @returns {{date: string|null, total: number|null, locations: string[], rounds: number[]|null}[]}
 */
export function parseMail(text, refDate = new Date()) {
  const lines = text
    .replace(/[​-‍﻿]/g, '')
    .replace(/ /g, ' ')
    .split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const locations = ['', '', '', '', ''], rounds = [];
  let total = null, current = -1, firstRoundLine = lines.length;
  lines.forEach((line, i) => {
    const m = line.match(MAIL_ROUND);
    if (m) {
      current = Number(m[1]) - 1;
      firstRoundLine = Math.min(firstRoundLine, i);
      locations[current] = m[2].trim() || (lines[i + 1] ?? '');
      return;
    }
    // Score als "91" + "your score" op twee regels, of "91 your score …" op één regel.
    const inline = line.match(/^(\d{1,4})\s+your score\b/i);
    const split = /^your score\b/i.test(line) && /^\d{1,4}$/.test(lines[i - 1] ?? '') ? Number(lines[i - 1]) : null;
    const score = inline ? Number(inline[1]) : split;
    if (score === null) return;
    if (current < 0) total = score;
    else if (rounds[current] === undefined && score <= 100) rounds[current] = score;
  });
  if (!locations.some(Boolean)) return [];

  // Datum: liefst de "Thursday, November 5"-regel vóór de eerste ronde.
  const head = lines.slice(0, firstRoundLine);
  const dm = head.map((l) => l.match(MAIL_DATE_WEEKDAY)).find(Boolean)
    ?? head.map((l) => l.match(MAIL_DATE)).find(Boolean);
  const date = dm ? toIsoDate(MONTHS[dm[1].toLowerCase()], Number(dm[2]), refDate) : null;

  const hasRounds = [0, 1, 2, 3, 4].every((i) => rounds[i] !== undefined);
  return [{ date, total: hasRounds ? total ?? weightedTotal(rounds) : null, locations, rounds: hasRounds ? rounds : null }];
}

/**
 * @param {string} text  gekopieerde chat
 * @param {{players: string[], me: string, refDate?: Date}} opts
 * @returns {{results: object[], messages: object[], dates: string[]}}
 */
export function parseChat(text, { players = [], me = 'Ik', refDate = new Date() } = {}) {
  const known = new Map(players.map((p) => [normalizeName(p), p]));
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const results = [];
  const messages = [];
  let sender = null;
  let time = null;
  let currentDate = null;

  const isHeader = (i) => i < lines.length && parseHeader(lines[i], refDate) !== null;
  const nextMeaningful = (i) => {
    let j = i + 1;
    while (j < lines.length && TIME.test(lines[j])) j++;
    return j;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (TIME.test(line)) { time = line.match(/\d{1,2}:\d{2}/)[0].padStart(5, '0'); continue; }
    if (NOISE.some((re) => re.test(line))) continue;
    if (ME_META.test(line)) { sender = me; continue; }
    const other = OTHER_META.map((re) => line.match(re)).find(Boolean);
    if (other) { sender = known.get(normalizeName(other[1])) ?? other[1]; continue; }

    const knownName = known.get(normalizeName(line));
    if (knownName) { sender = knownName; continue; }

    const date = parseHeader(line, refDate);
    if (date) {
      currentDate = date;
      // Zoek de 5 rondescores en de eindscore in de volgende regels.
      let rounds = null, final = null, j = i + 1;
      for (; j < Math.min(lines.length, i + 5); j++) {
        if (!rounds) { rounds = parseRounds(lines[j]); if (rounds) continue; }
        const f = lines[j].match(FINAL);
        if (f) { final = Number(f[1]); break; }
      }
      if (rounds) {
        const computed = weightedTotal(rounds);
        const warnings = [];
        if (!sender) warnings.push('Afzender onbekend');
        if (final === null) warnings.push('Geen "Final score" gevonden');
        else if (final !== computed) warnings.push(`Eindscore ${final} klopt niet met rondes (${computed})`);
        results.push({ player: sender ?? '', date, rounds, total: final ?? computed, time, warnings });
        i = final !== null ? j : i + 1;
      }
      continue;
    }

    // Korte naamachtige regel vlak voor een resultaat: waarschijnlijk een (nieuwe) speler.
    if (NAME_LIKE.test(line) && line.split(/\s+/).length <= 3 && isHeader(nextMeaningful(i))) {
      sender = line;
      continue;
    }

    messages.push({ player: sender ?? '', text: line, time, date: currentDate });
  }

  // Berichten vóór het eerste resultaat horen bij de eerste datum.
  const firstDate = results[0]?.date ?? null;
  for (const m of messages) if (!m.date) m.date = firstDate;

  const dates = [...new Set(results.map((r) => r.date))].sort();
  return { results, messages, dates };
}
