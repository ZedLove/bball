import type { SimulationState } from '../types.ts';

/** Render the top-level command menu with inline current state. */
export function renderMenu(state: SimulationState): string {
  const statusLine = formatStatusLine(state);

  return `
╔════════════════════════════════════════════════════════════════╗
║              MLB Dev Event Simulator – Main Menu               ║
╚════════════════════════════════════════════════════════════════╝

  Current state: ${statusLine}

  Game Events:
    1.  game-start        – Begin game (inning 1, top)
    2.  game-end          – End game (mark final)
    3.  out               – Record an out (0→1→2→3)
    4.  pitching-change   – Swap pitcher
    5.  batting-begins    – Advance to next half-inning, emit batting
    6.  batting-ends      – End current half, emit between-innings
    7.  between-innings   – Explicitly emit between-innings
    8.  delay             – Trigger a game delay
    9.  clear-delay       – Resume from delay

  State Control:
    10. set-inning        – Jump to a specific inning
    11. set-score         – Set team scores
    12. set-team-batting  – Swap batting/defending sides
    13. state             – Show full current game state
    14. reset             – Reset everything to defaults

  ?, help                 – Show this menu
  q, exit                 – Quit simulator
`.trim();
}

/** Render a detailed current-state panel. */
export function renderState(state: SimulationState): string {
  const batting =
    state.inning.half === 'Top' ? state.teams.away.abbreviation : state.teams.home.abbreviation;
  const defending =
    state.inning.half === 'Top' ? state.teams.home.abbreviation : state.teams.away.abbreviation;
  const pitcher = state.currentPitcher
    ? `${state.currentPitcher.fullName} (#${state.currentPitcher.id})`
    : 'None';
  const extras = state.inning.number > state.scheduledInnings ? ' [EXTRAS]' : '';
  const delayLine = state.isDelayed ? `\n  Delay:   ${state.delayDescription}` : '';
  const status = state.gameEnded ? 'Final' : state.gameStarted ? 'In Progress' : 'Not Started';

  return `
╔════════════════════════════════════════════════════════════════╗
║                      Current Game State                        ║
╚════════════════════════════════════════════════════════════════╝

  Inning:   ${state.inning.ordinal} ${state.inning.half}${extras}
  Score:    ${state.teams.away.abbreviation} ${state.score.away} – ${state.teams.home.abbreviation} ${state.score.home}
  Batting:  ${batting}               Defending: ${defending}
  Outs:     ${state.outs}                    Pitcher:   ${pitcher}${delayLine}
  Status:   ${status}
`.trim();
}

function formatStatusLine(state: SimulationState): string {
  if (!state.gameStarted) return 'No game started — use game-start';
  if (state.gameEnded) {
    return (
      `Final: ${state.teams.away.abbreviation} ${state.score.away}` +
      ` – ${state.teams.home.abbreviation} ${state.score.home}`
    );
  }

  const batting =
    state.inning.half === 'Top' ? state.teams.away.abbreviation : state.teams.home.abbreviation;
  const delay = state.isDelayed ? ' | ⚠ DELAYED' : '';
  const extras = state.inning.number > state.scheduledInnings ? ' [EXTRAS]' : '';
  return (
    `${state.inning.ordinal} ${state.inning.half}${extras}` +
    ` | ${batting} batting` +
    ` | ${state.teams.away.abbreviation} ${state.score.away}–${state.teams.home.abbreviation} ${state.score.home}` +
    ` | ${state.outs} outs${delay}`
  );
}
