import type { Text } from "./game.ts";

// one finished round; votes[i] = who player i accused (null when the vote was skipped);
// guessed = the caught imposter named the word (imposter-guess option), which turns the round into an imposter win
export type RoundLog = { names: string[]; imposters: number[]; accused: number | null; votes: number[] | null; word: Text; guessed?: boolean };

export type PlayerStats = {
  name: string;
  rounds: number;
  imposter: number; // rounds played as imposter
  escaped: number; // as imposter: not caught, or caught but guessed the word
  correctVotes: number; // as crew, voted for an imposter
  votesTaken: number; // votes received ("most suspected")
  points: number; // +1 correct crew vote, +2 escaping as imposter
};

export function stats(history: RoundLog[]) {
  const by = new Map<string, PlayerStats>();
  const timeline: Record<string, number>[] = []; // cumulative points after each round
  let crewWins = 0;
  let imposterWins = 0;
  for (const r of history) {
    const decided = r.accused !== null;
    const caught = decided && r.imposters.includes(r.accused!) && !r.guessed;
    if (decided && caught) crewWins++;
    else if (decided) imposterWins++;
    r.names.forEach((name, i) => {
      const p = by.get(name) ?? { name, rounds: 0, imposter: 0, escaped: 0, correctVotes: 0, votesTaken: 0, points: 0 };
      p.rounds++;
      if (r.imposters.includes(i)) {
        p.imposter++;
        if (decided && (r.accused !== i || r.guessed)) {
          p.escaped++;
          p.points += 2;
        }
      } else if (r.votes && r.imposters.includes(r.votes[i])) {
        p.correctVotes++;
        p.points++;
      }
      p.votesTaken += r.votes?.filter((v) => v === i).length ?? 0;
      by.set(name, p);
    });
    timeline.push(Object.fromEntries([...by.values()].map((p) => [p.name, p.points])));
  }
  const players = [...by.values()].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  return { rounds: history.length, crewWins, imposterWins, players, timeline };
}
