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

const MAIL_ROUND = /^round\s*([1-5])\s*[·•:\-–]\s*(.+)$/i;
const MAIL_DATE = new RegExp(`\\b(${Object.keys(MONTHS).join('|')})\\s+(\\d{1,2})\\b`, 'i');

/**
 * Leest de dagelijkse "Today on MapTap"-mail: datum, de 5 locaties en (indien aanwezig) je eigen score.
 * @returns {{date: string, total: number|null, locations: string[], rounds: number[]|null}[]}
 */
export function parseMail(text, refDate = new Date()) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const dateLine = lines.find((l) => MAIL_DATE.test(l) && !MAIL_ROUND.test(l));
  if (!dateLine) return [];
  const [, month, day] = dateLine.match(MAIL_DATE);
  const date = toIsoDate(MONTHS[month.toLowerCase()], Number(day), refDate);

  const locations = [], rounds = [];
  let total = null;
  lines.forEach((line, i) => {
    const m = line.match(MAIL_ROUND);
    if (m) { locations[Number(m[1]) - 1] = m[2]; return; }
    // "91" gevolgd door "your score" → score van de laatst geziene ronde.
    if (/^your score$/i.test(line) && /^\d{1,3}$/.test(lines[i - 1] ?? '')) {
      const n = locations.filter(Boolean).length;
      if (n) rounds[n - 1] = Number(lines[i - 1]);
    }
    const t = line.match(/^(\d{1,4})\s+your score\b/i);
    if (t) total = Number(t[1]);
  });
  if (locations.filter(Boolean).length !== 5) return [];
  const hasRounds = rounds.filter((v) => v !== undefined).length === 5;
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
