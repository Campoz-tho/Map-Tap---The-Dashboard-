// Berekeningen bovenop data/scores.json.
import { continentOf, CONTINENTS } from './geo.js?v=mw7rnaav';

export const ROUND_LABELS = ['R1 ×1', 'R2 ×1', 'R3 ×2', 'R4 ×3', 'R5 ×3'];
const MULT = [1, 1, 2, 3, 3];

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// Accuraatheid: score zónder multipliers, elke locatie telt even zwaar (5 × 100), herschaald naar 1000.
export const accuracyOf = (rounds) => rounds.reduce((a, b) => a + b, 0) * 2;

export function rankDay(day) {
  const sorted = [...day.results].sort((a, b) => b.total - a.total);
  const best = sorted[0]?.total ?? null;
  let rank = 0, prev = null;
  return sorted.map((r, i) => {
    if (r.total !== prev) { rank = i + 1; prev = r.total; }
    return { ...r, rank, isWinner: r.total === best, gap: best - r.total, accuracy: accuracyOf(r.rounds) };
  });
}

export function computeStats(data) {
  const days = [...data.days].sort((a, b) => a.date.localeCompare(b.date));
  const players = data.players;
  const per = Object.fromEntries(players.map((p) => [p, {
    player: p, played: 0, wins: 0, podiums: 0, totals: [], rawTotals: [], rounds: [[], [], [], [], []],
    best: null, worst: null, perfects: 0, streak: 0, bestStreak: 0, lost: [0, 0, 0, 0, 0],
  }]));

  const dayInfo = days.map((day) => {
    const ranked = rankDay(day);
    const winners = ranked.filter((r) => r.isWinner).map((r) => r.player);
    for (const r of ranked) {
      const s = per[r.player];
      if (!s) continue;
      s.played++;
      s.totals.push(r.total);
      s.rawTotals.push(r.accuracy);
      r.rounds.forEach((v, i) => { s.rounds[i].push(v); s.lost[i] += (100 - v) * MULT[i]; });
      s.perfects += r.rounds.filter((v) => v === 100).length;
      if (r.isWinner) s.wins++;
      if (r.rank <= 3) s.podiums++;
      if (!s.best || r.total > s.best.total) s.best = { total: r.total, date: day.date };
      if (!s.worst || r.total < s.worst.total) s.worst = { total: r.total, date: day.date };
    }
    // Winstreak: opeenvolgende speeldagen gewonnen.
    for (const p of players) {
      const s = per[p];
      if (winners.includes(p)) { s.streak++; s.bestStreak = Math.max(s.bestStreak, s.streak); }
      else s.streak = 0;
    }
    const roundAvg = [0, 1, 2, 3, 4].map((i) => avg(day.results.map((r) => r.rounds[i])));
    const margin = ranked.length > 1 && winners.length === 1 ? ranked[0].total - ranked[1].total : 0;
    return {
      ...day, ranked, winners, roundAvg, margin,
      locations: data.locations?.[day.date] ?? [],
      missing: players.filter((p) => !day.results.some((r) => r.player === p)),
    };
  });

  const table = players.map((p) => {
    const s = per[p];
    return {
      ...s,
      avg: avg(s.totals),
      rawAvg: avg(s.rawTotals),
      roundAvg: s.rounds.map(avg),
      winRate: s.played ? s.wins / s.played : 0,
      lostAvg: s.lost.map((l) => (s.played ? l / s.played : null)),
    };
  }).sort((a, b) => b.wins - a.wins || (b.avg ?? -1) - (a.avg ?? -1));

  // Records over alle dagen.
  const all = dayInfo.flatMap((d) => d.ranked.map((r) => ({ ...r, date: d.date })));
  const highest = all.reduce((m, r) => (!m || r.total > m.total ? r : m), null);
  const lowest = all.reduce((m, r) => (!m || r.total < m.total ? r : m), null);
  const decided = dayInfo.filter((d) => d.ranked.length > 1 && d.winners.length === 1);
  const closest = decided.reduce((m, d) => (!m || d.margin < m.margin ? d : m), null);
  const biggest = decided.reduce((m, d) => (!m || d.margin > m.margin ? d : m), null);

  // Moeilijkste locaties (alleen als er namen zijn ingevuld).
  const extreme = (results, i, pick) => {
    if (!results.length) return null;
    const score = pick(...results.map((r) => r.rounds[i]));
    return { score, players: results.filter((r) => r.rounds[i] === score).map((r) => r.player) };
  };
  const locations = dayInfo.flatMap((d) => (d.locations ?? []).map((name, i) => ({
    name, date: d.date, round: i, avg: d.roundAvg[i],
    best: extreme(d.results, i, Math.max),
    worst: extreme(d.results, i, Math.min),
  }))).filter((l) => l.name && l.avg !== null);

  const groupRoundAvg = [0, 1, 2, 3, 4].map((i) => avg(all.map((r) => r.rounds[i])));

  // Per continent: gemiddelde rondescore (op 100, zonder multipliers) per speler.
  const continents = {};
  for (const l of locations) {
    const code = continentOf(l.name);
    if (!code) continue;
    const c = (continents[code] ??= { code, name: CONTINENTS[code], locations: [], scores: {} });
    c.locations.push(l);
    const day = dayInfo.find((d) => d.date === l.date);
    for (const r of day.results) (c.scores[r.player] ??= []).push(r.rounds[l.round]);
  }
  for (const c of Object.values(continents)) {
    c.ranking = Object.entries(c.scores)
      .map(([player, xs]) => ({ player, avg: avg(xs), n: xs.length, sum: xs.reduce((a, b) => a + b, 0) }))
      .sort((a, b) => b.avg - a.avg || b.n - a.n);
    const best = c.ranking[0]?.avg;
    c.leaders = c.ranking.filter((r) => r.avg === best).map((r) => r.player);
    c.hardest = c.locations.reduce((m, l) => (!m || l.avg < m.avg ? l : m), null);
  }

  return { days: dayInfo, table, highest, lowest, closest, biggest, locations, groupRoundAvg, continents };
}
