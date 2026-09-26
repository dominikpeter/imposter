import { outcome, type Text } from "./game.ts";

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
  crewVotes: number; // rounds as crew with a vote (the base for the hit rate)
  votedFor: Record<string, number>; // whom they accused, and how often
  votedBy: Record<string, number>; // who accused them, and how often
  gains: number[]; // points won in each round they played, in order
};

// one round for the drill-down: who was imposter, who got accused, every vote by name
export type RoundResult = "caught" | "escaped" | "guessed" | "skipped";
export type RoundDetail = { word: Text; imposters: string[]; accused: string | null; result: RoundResult; votes: [string, string][] };

export function stats(history: RoundLog[]) {
  const by = new Map<string, PlayerStats>();
  const timeline: Record<string, number>[] = []; // cumulative points after each round
  let crewWins = 0;
  let imposterWins = 0;
  const log: RoundDetail[] = [];
  for (const r of history) {
    const { decided, caught, survivors } = outcome(r.imposters, r.accused, r.guessed);
    if (caught) crewWins++;
    else if (decided) imposterWins++;
    r.names.forEach((name, i) => {
      const p = by.get(name) ?? { name, rounds: 0, imposter: 0, escaped: 0, correctVotes: 0, votesTaken: 0, points: 0, crewVotes: 0, votedFor: {}, votedBy: {}, gains: [] };
      const before = p.points;
      p.rounds++;
      if (r.imposters.includes(i)) {
        p.imposter++;
        if (survivors.includes(i)) {
          p.escaped++;
          p.points += 2;
        }
      } else if (Number.isInteger(r.votes?.[i])) { // null = didn't vote (a room that went on without them)
        p.crewVotes++;
        if (r.imposters.includes(r.votes![i])) {
          p.correctVotes++;
          p.points++;
        }
      }
      r.votes?.forEach((v, j) => {
        if (j === i && r.names[v]) p.votedFor[r.names[v]] = (p.votedFor[r.names[v]] ?? 0) + 1;
        if (v === i && j !== i) p.votedBy[r.names[j]] = (p.votedBy[r.names[j]] ?? 0) + 1;
      });
      p.votesTaken += r.votes?.filter((v) => v === i).length ?? 0;
      p.gains.push(p.points - before);
      by.set(name, p);
    });
    log.push({
      word: r.word,
      imposters: r.imposters.map((i) => r.names[i]),
      accused: r.accused === null ? null : r.names[r.accused],
      result: !decided ? "skipped" : caught ? "caught" : r.guessed ? "guessed" : "escaped",
      votes: (r.votes ?? []).flatMap((v, j) => (r.names[v] ? [[r.names[j], r.names[v]] as [string, string]] : [])),
    });
    timeline.push(Object.fromEntries([...by.values()].map((p) => [p.name, p.points])));
  }
  const players = [...by.values()].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  return { rounds: history.length, crewWins, imposterWins, players, timeline, log };
}

/** The name with the highest count (first one on a tie), for "suspects most" / "suspected most by". */
export const most = (counts: Record<string, number>) => Object.entries(counts).sort((a, b) => b[1] - a[1])[0] ?? null;

/** Everyone tied on the most points (a draw names them all). */
export function winners(history: RoundLog[]) {
  const ps = stats(history).players;
  return ps.filter((p) => p.points === ps[0]?.points).map((p) => p.name);
}
