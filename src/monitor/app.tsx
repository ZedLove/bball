import { useEffect } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { io } from 'socket.io-client';
import { SOCKET_EVENTS } from '../server/socket-events.ts';
import type {
  GameEventsPayload,
  GameSummary,
} from '../server/socket-events.ts';
import type { GameUpdate } from '../scheduler/parser.ts';
import { useDashboardState } from './hooks/use-dashboard-state.ts';
import { THEME } from './theme.ts';

const SOCKET_URL = process.env['SOCKET_URL'] ?? 'http://localhost:4000';

export function App() {
  const { exit } = useApp();
  const [state, dispatch] = useDashboardState();

  useEffect(() => {
    const socket = io(SOCKET_URL);

    socket.on('connect', () => {
      dispatch({ type: 'connected' });
    });

    socket.on('disconnect', () => {
      dispatch({ type: 'disconnected' });
    });

    socket.on(SOCKET_EVENTS.GAME_UPDATE, (payload: GameUpdate) => {
      dispatch({ type: 'game-update', payload });
    });

    socket.on(SOCKET_EVENTS.GAME_EVENTS, (payload: GameEventsPayload) => {
      dispatch({ type: 'game-events', payload });
    });

    socket.on(SOCKET_EVENTS.GAME_SUMMARY, (payload: GameSummary) => {
      dispatch({ type: 'game-summary', payload });
    });

    return () => {
      socket.disconnect();
    };
  }, [dispatch]);

  useInput((input) => {
    if (input === 'q') {
      exit();
    }
  });

  const isConnected = state.connectedAt !== null;

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text color={THEME.borderAccent} bold>
          bball dev socket monitor
        </Text>
      </Box>
      <Box>
        <Text color={isConnected ? THEME.connected : THEME.disconnected}>
          {isConnected ? '● Connected' : '○ Disconnected'}
        </Text>
        <Text color={THEME.fgDim}>{' — press q to quit'}</Text>
      </Box>
      {state.lastUpdate !== null && (
        <Box marginTop={1}>
          <Text color={THEME.fg}>
            {state.lastUpdate.teams.away.abbreviation}{' '}
            {state.lastUpdate.score.away} –{' '}
            {state.lastUpdate.teams.home.abbreviation}{' '}
            {state.lastUpdate.score.home}
          </Text>
        </Box>
      )}
      {state.lastUpdate === null && isConnected && (
        <Box marginTop={1}>
          <Text color={THEME.fgDim}>Waiting for game data…</Text>
        </Box>
      )}
    </Box>
  );
}
