import readline from 'readline';
import type { Server as SocketIOServer } from 'socket.io';
import type { StateStore } from '../state/store.ts';
import type {
  PitchingChangeOptions,
  PlateAppearanceOptions,
  ScoreOptions,
  SubstitutionOptions,
  DelayOptions,
  NewBatterOptions,
  PitchOptions,
} from '../types.ts';
import { renderMenu, renderState } from './renderer.ts';
import {
  handleGameStart,
  handleGameEnd,
  handleOut,
  handlePitchingChange,
  handleBattingBegins,
  handleBattingEnds,
  handleBetweenInnings,
  handleDelay,
  handleClearDelay,
  handleSetInning,
  handleSetScore,
  handleSetTeamBatting,
  handlePlateAppearance,
  handleScore,
  handleOffensiveSub,
  handleDefensiveSub,
  handleSimGameSummary,
  handleNewBatter,
  handlePitch,
} from '../emitter/event-handlers.ts';

// Maps numeric menu selections (1-based) to command names.
const NUMBERED_COMMANDS = [
  'game-start',
  'game-end',
  'out',
  'pitching-change',
  'batting-begins',
  'batting-ends',
  'between-innings',
  'delay',
  'clear-delay',
  'plate-appearance',
  'score',
  'offensive-sub',
  'defensive-sub',
  'game-summary',
  'new-batter',
  'pitch',
  'set-inning',
  'set-score',
  'set-team-batting',
  'state',
  'reset',
] as const;

/** Tokenise a command string, respecting single- and double-quoted strings. */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (const char of input) {
    if (!inQuote && (char === '"' || char === "'")) {
      inQuote = true;
      quoteChar = char;
    } else if (inQuote && char === quoteChar) {
      inQuote = false;
      quoteChar = '';
    } else if (char === ' ' && !inQuote) {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

/** Parse --key value pairs from a token array. */
function parseArgs(tokens: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = tokens[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        result[key] = next;
        i++;
      } else {
        result[key] = 'true';
      }
    }
  }
  return result;
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function askWithDefault(
  rl: readline.Interface,
  question: string,
  defaultValue: string
): Promise<string> {
  const answer = await ask(rl, `  ${question} [${defaultValue}]: `);
  return answer.trim() || defaultValue;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function createCliInterface(
  io: SocketIOServer,
  store: StateStore
): void {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  console.log('\n' + renderMenu(store.getState()) + '\n');

  const loop = async (): Promise<void> => {
    const raw = await ask(rl, '\nCommand> ').catch(() => 'exit');
    const line = raw.trim();

    if (!line) {
      return loop();
    }

    const tokens = tokenize(line);
    const first = tokens[0].toLowerCase();
    const inlineArgs = parseArgs(tokens.slice(1));

    // Allow numeric menu selection
    const n = parseInt(first, 10);
    const cmd =
      !isNaN(n) && n >= 1 && n <= NUMBERED_COMMANDS.length
        ? NUMBERED_COMMANDS[n - 1]
        : first;

    if (cmd === 'exit' || cmd === 'quit' || cmd === 'q') {
      console.log('\nGoodbye.\n');
      rl.close();
      return;
    }

    await dispatch(cmd, inlineArgs, rl, io, store);
    return loop();
  };

  rl.on('close', () => process.exit(0));

  loop().catch((err: unknown) => {
    console.error('CLI error:', err);
    rl.close();
  });
}

// ---------------------------------------------------------------------------
// Command dispatcher
// ---------------------------------------------------------------------------

async function dispatch(
  cmd: string,
  args: Record<string, string>,
  rl: readline.Interface,
  io: SocketIOServer,
  store: StateStore
): Promise<void> {
  switch (cmd) {
    case 'game-start': {
      print(handleGameStart(store, io).message);
      break;
    }

    case 'game-end': {
      print(handleGameEnd(store, io).message);
      break;
    }

    case 'out': {
      print(handleOut(store, io).message);
      break;
    }

    case 'pitching-change': {
      const opts: PitchingChangeOptions = {};

      if (args['pitcher-id']) {
        opts.pitcherId = parseInt(args['pitcher-id'], 10);
      } else {
        const raw = await askWithDefault(
          rl,
          'New pitcher ID',
          String(randomId())
        );
        const parsed = parseInt(raw, 10);
        if (!isNaN(parsed)) opts.pitcherId = parsed;
      }

      if (args['pitcher-name']) {
        opts.pitcherName = args['pitcher-name'];
      } else {
        const name = await ask(rl, '  New pitcher name (Enter to skip): ');
        if (name.trim()) opts.pitcherName = name.trim();
      }

      print(handlePitchingChange(store, io, opts).message);
      break;
    }

    case 'batting-begins': {
      print(handleBattingBegins(store, io).message);
      break;
    }

    case 'batting-ends': {
      print(handleBattingEnds(store, io).message);
      break;
    }

    case 'between-innings': {
      print(handleBetweenInnings(store, io).message);
      break;
    }

    case 'delay': {
      const opts: DelayOptions = {};
      if (args['reason']) {
        opts.reason = args['reason'];
      } else {
        const reason = await askWithDefault(rl, 'Delay reason', 'Rain');
        opts.reason = reason;
      }
      print(handleDelay(store, io, opts).message);
      break;
    }

    case 'clear-delay': {
      print(handleClearDelay(store, io).message);
      break;
    }

    case 'set-inning': {
      let n: number;
      if (args['inning']) {
        n = parseInt(args['inning'], 10);
      } else {
        const raw = await askWithDefault(
          rl,
          'Jump to inning',
          String(store.getState().inning.number)
        );
        n = parseInt(raw, 10);
      }
      print(handleSetInning(store, { inning: n }).message);
      break;
    }

    case 'set-score': {
      const s = store.getState();
      let away: number, home: number;

      if (args['away'] !== undefined && args['home'] !== undefined) {
        away = parseInt(args['away'], 10);
        home = parseInt(args['home'], 10);
      } else {
        const awayRaw = await askWithDefault(
          rl,
          `${s.teams.away.abbreviation} runs`,
          String(s.score.away)
        );
        const homeRaw = await askWithDefault(
          rl,
          `${s.teams.home.abbreviation} runs`,
          String(s.score.home)
        );
        away = parseInt(awayRaw, 10);
        home = parseInt(homeRaw, 10);
      }
      print(handleSetScore(store, { away, home }).message);
      break;
    }

    case 'set-team-batting': {
      print(handleSetTeamBatting(store).message);
      break;
    }

    case 'plate-appearance': {
      const opts: PlateAppearanceOptions = {};
      if (args['type']) {
        opts.type = args['type'];
      }
      print(handlePlateAppearance(store, io, opts).message);
      break;
    }

    case 'score': {
      const opts: ScoreOptions = {};
      if (args['type']) opts.type = args['type'];
      if (args['runs']) {
        const r = parseInt(args['runs'], 10);
        if (!isNaN(r)) opts.runs = r;
      }
      print(handleScore(store, io, opts).message);
      break;
    }

    case 'offensive-sub': {
      const opts: SubstitutionOptions = {};
      if (args['name']) {
        opts.playerName = args['name'];
      } else {
        const name = await ask(rl, '  Player name (Enter to skip): ');
        if (name.trim()) opts.playerName = name.trim();
      }
      print(handleOffensiveSub(store, io, opts).message);
      break;
    }

    case 'defensive-sub': {
      const opts: SubstitutionOptions = {};
      if (args['name']) {
        opts.playerName = args['name'];
      } else {
        const name = await ask(rl, '  Player name (Enter to skip): ');
        if (name.trim()) opts.playerName = name.trim();
      }
      print(handleDefensiveSub(store, io, opts).message);
      break;
    }

    case 'game-summary': {
      print(handleSimGameSummary(store, io).message);
      break;
    }

    case 'new-batter': {
      const opts: NewBatterOptions = {};
      if (args['batter-name']) opts.batterName = args['batter-name'];
      if (args['batter-id']) {
        const id = parseInt(args['batter-id'], 10);
        if (!isNaN(id)) opts.batterId = id;
      }
      if (args['pitcher-name']) opts.pitcherName = args['pitcher-name'];
      if (args['pitcher-id']) {
        const id = parseInt(args['pitcher-id'], 10);
        if (!isNaN(id)) opts.pitcherId = id;
      }
      print(handleNewBatter(store, io, opts).message);
      break;
    }

    case 'pitch': {
      const opts: PitchOptions = {};
      if (args['type']) opts.type = args['type'];
      if (args['speed']) {
        const spd = parseInt(args['speed'], 10);
        if (!isNaN(spd)) opts.speed = spd;
      }
      if (args['call']) {
        const rawCall = args['call'];
        if (
          rawCall === 'Ball' ||
          rawCall === 'Strike' ||
          rawCall === 'Foul' ||
          rawCall === 'In play'
        ) {
          opts.call = rawCall;
        }
      }
      print(handlePitch(store, io, opts).message);
      break;
    }

    case 'state': {
      console.log('\n' + renderState(store.getState()));
      break;
    }

    case 'reset': {
      store.reset();
      print('✓ State reset to defaults');
      break;
    }

    case 'help':
    case '?': {
      console.log('\n' + renderMenu(store.getState()));
      break;
    }

    // Power-user shortcuts
    case 'gs':
      print(handleGameStart(store, io).message);
      break;
    case 'ge':
      print(handleGameEnd(store, io).message);
      break;
    case 'o':
      print(handleOut(store, io).message);
      break;
    case 'pc':
      print(handlePitchingChange(store, io, {}).message);
      break;
    case 'bb':
      print(handleBattingBegins(store, io).message);
      break;

    default:
      print(
        `⚠  Unknown command: "${cmd}". Type help or ? for the full command list.`
      );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function print(message: string): void {
  console.log('\n' + message);
}

function randomId(): number {
  return Math.floor(Math.random() * 900_000) + 100_000;
}
