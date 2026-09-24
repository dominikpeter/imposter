// votes[i] = index of the player that player i accused
export type Tally = { counts: number[]; accused: number | null };

// Most votes gets accused; a tie at the top means no one is accused (discuss & vote again).
export function tally(votes: number[], players: number): Tally {
  const counts = Array<number>(players).fill(0);
  for (const v of votes) counts[v]++;
  const top = Math.max(...counts);
  const leaders = counts.flatMap((c, i) => (c === top ? [i] : []));
  return { counts, accused: leaders.length === 1 ? leaders[0] : null };
}
