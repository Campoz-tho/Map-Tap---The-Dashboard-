// Berekeningen bovenop data/scores.json.

export const ROUND_LABELS = ['R1 ×1', 'R2 ×1', 'R3 ×2', 'R4 ×3', 'R5 ×3'];
const MULT = [1, 1, 2, 3, 3];

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function rankDay(day) {
  const sorted = [...day.results].sort((a, b) => b.total - a.total);
  const best = sorted[0]?.total ?? null;
  let rank = 0, prev = null;
  return sorted.map((r, i) => {
    if (r.total !== prev) { rank = i + 1; prev = r.total; }
    return { ...r, rank, isWinner: r.total === best, gap: best - r.total };
  });
}

export function computeStats(data) {
  const days = [...data.days].sort((a, b) => a.date.localeCompare(b.date));
  const players = data.players;
  const per = Object.fromEntries(players.map((p) => [p, {
    player: p, played: 0, wins: 0, podiums: 0, totals: [], rounds: [[], [], [], [], []],
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
    return { ...day, ranked, winners, roundAvg, margin, missing: players.filter((p) => !day.results.some((r) => r.player === p)) };
  });

  const table = players.map((p) => {
    const s = per[p];
    return {
      ...s,
      avg: avg(s.totals),
      roundAvg: s.rounds.map(avg),
      winRate: s.played ? s.wins / s.played : 0,
      lostAvg: s.lost.map((l) => (s.played ? l / s.played : null)),
    };
  }).sort((a, b) => b.wins - a.wins || (b.avg ?? -1) - (a.avg ?? -1));

  // Records over alle dagen.
  const all = dayInfo.flatMap((d) => d.ranked.map((r) => ({ ...r, date: d.date })));
  const highest = all.reduce((m, r) => (!m || r.total > m.total ? r : m), null);
  const decided = dayInfo.filter((d) => d.ranked.length > 1 && d.winners.length === 1);
  const closest = decided.reduce((m, d) => (!m || d.margin < m.margin ? d : m), null);
  const biggest = decided.reduce((m, d) => (!m || d.margin > m.margin ? d : m), null);

  // Moeilijkste locaties (alleen als er namen zijn ingevuld).
  const locations = dayInfo.flatMap((d) => (d.locations ?? []).map((name, i) => ({
    name, date: d.date, round: i, avg: d.roundAvg[i],
    best: d.results.reduce((m, r) => (!m || r.rounds[i] > m.score ? { player: r.player, score: r.rounds[i] } : m), null),
  }))).filter((l) => l.name && l.avg !== null);

  const groupRoundAvg = [0, 1, 2, 3, 4].map((i) => avg(all.map((r) => r.rounds[i])));

  return { days: dayInfo, table, highest, closest, biggest, locations, groupRoundAvg };
}
