import { vi, describe, it, expect } from 'vitest';
import { createServer } from 'http';
import type { Server as HttpServer } from 'http';
import type { AddressInfo } from 'net';
import { io as ioc } from 'socket.io-client';
import type { Server as SocketIOServer } from 'socket.io';

// ── Module mocks (hoisted before imports) ────────────────────────────────────

vi.mock('../config/env.ts', () => ({
  CONFIG: { CORS_ORIGIN: '*' },
}));

vi.mock('../config/logger.ts', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { attachSocketServer, registerConnectionHandlers } from './socket.ts';
import { SOCKET_EVENTS } from './socket-events.ts';
import type { GameUpdate } from '../scheduler/parser.ts';
import type { Scheduler } from '../scheduler/mlb-scheduler.ts';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_UPDATE: GameUpdate = {
  gamePk: 823963,
  gameStatus: 'In Progress',
  teams: {
    away: { id: 119, name: 'Los Angeles Dodgers', abbreviation: 'LAD' },
    home: { id: 121, name: 'New York Mets', abbreviation: 'NYM' },
  },
  score: { away: 2, home: 3 },
  inning: { number: 7, half: 'Top', ordinal: '7th' },
  outs: 1,
  defendingTeam: 'NYM',
  battingTeam: 'LAD',
  isDelayed: false,
  delayDescription: null,
  isExtraInnings: false,
  scheduledInnings: 9,
  trackingMode: 'outs',
  outsRemaining: 2,
  totalOutsRemaining: 8,
  runsNeeded: null,
  currentPitcher: { id: 605113, fullName: 'Kodai Senga' },
  upcomingPitcher: null,
  inningBreakLength: null,
};

// ---------------------------------------------------------------------------
// Test server lifecycle helpers
// ---------------------------------------------------------------------------

interface TestServer {
  io: SocketIOServer;
  httpServer: HttpServer;
  port: number;
}

async function createTestServer(scheduler: Scheduler): Promise<TestServer> {
  const httpServer = createServer();
  const io = attachSocketServer(httpServer);
  registerConnectionHandlers(io, scheduler);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as AddressInfo).port;
  return { io, httpServer, port };
}

async function destroyTestServer({ io, httpServer }: TestServer): Promise<void> {
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
}

/** Waits `ms` milliseconds to allow any unexpected async emissions to arrive. */
function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('registerConnectionHandlers', () => {
  it('replays last game-update to a newly connected client', async () => {
    const scheduler: Scheduler = {
      stop: vi.fn(),
      getLastUpdate: vi.fn(() => SAMPLE_UPDATE),
    };

    const server = await createTestServer(scheduler);

    // Register the game-update listener before connecting to avoid a race
    // where the server emits during the connection handler before the client
    // has set up its listener.
    const client = ioc(`http://localhost:${server.port}`, { autoConnect: false });
    const receivedPromise = new Promise<GameUpdate>((resolve) => {
      client.once(SOCKET_EVENTS.GAME_UPDATE, (data: GameUpdate) => resolve(data));
    });
    client.connect();

    expect(await receivedPromise).toEqual(SAMPLE_UPDATE);

    client.disconnect();
    await destroyTestServer(server);
  });

  it('emits no game-update when scheduler has no last update', async () => {
    const scheduler: Scheduler = {
      stop: vi.fn(),
      getLastUpdate: vi.fn(() => null),
    };

    const server = await createTestServer(scheduler);
    const received: unknown[] = [];

    const client = ioc(`http://localhost:${server.port}`);
    client.on(SOCKET_EVENTS.GAME_UPDATE, (data: unknown) => received.push(data));

    await new Promise<void>((resolve) => client.once('connect', resolve));
    await waitMs(50);

    expect(received).toHaveLength(0);

    client.disconnect();
    await destroyTestServer(server);
  });

  it('does not replay game-events to a newly connected client', async () => {
    const scheduler: Scheduler = {
      stop: vi.fn(),
      getLastUpdate: vi.fn(() => SAMPLE_UPDATE),
    };

    const server = await createTestServer(scheduler);
    const gameEventsReceived: unknown[] = [];

    const client = ioc(`http://localhost:${server.port}`);
    client.on(SOCKET_EVENTS.GAME_EVENTS, (data: unknown) => gameEventsReceived.push(data));

    await new Promise<void>((resolve) => client.once('connect', resolve));
    await waitMs(50);

    expect(gameEventsReceived).toHaveLength(0);

    client.disconnect();
    await destroyTestServer(server);
  });

  it('does not replay game-summary to a newly connected client', async () => {
    const scheduler: Scheduler = {
      stop: vi.fn(),
      getLastUpdate: vi.fn(() => SAMPLE_UPDATE),
    };

    const server = await createTestServer(scheduler);
    const gameSummaryReceived: unknown[] = [];

    const client = ioc(`http://localhost:${server.port}`);
    client.on(SOCKET_EVENTS.GAME_SUMMARY, (data: unknown) => gameSummaryReceived.push(data));

    await new Promise<void>((resolve) => client.once('connect', resolve));
    await waitMs(50);

    expect(gameSummaryReceived).toHaveLength(0);

    client.disconnect();
    await destroyTestServer(server);
  });
});
