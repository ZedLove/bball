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
import { StatusBar } from './components/StatusBar.tsx';
import { Header } from './components/Header.tsx';
import { EventsPanel } from './components/EventsPanel.tsx';

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
    switch (input) {
      case 'q':
        exit();
        break;
      case 'a':
        dispatch({ type: 'set-filter', filter: 'all' });
        break;
      case 's':
        dispatch({ type: 'set-filter', filter: 'scoring' });
        break;
      case 'p':
        dispatch({ type: 'toggle-pitch-display' });
        break;
    }
  });

  return (
    <Box flexDirection="column">
      <StatusBar
        connectedAt={state.connectedAt}
        filter={state.filter}
        pitchDisplay={state.pitchDisplay}
      />
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={THEME.borderAccent}
        paddingX={1}
        marginTop={1}
      >
        <Text color={THEME.borderAccent} bold>
          {'bball dev socket monitor'}
        </Text>
        <Header lastUpdate={state.lastUpdate} />
      </Box>
      <EventsPanel
        lastUpdate={state.lastUpdate}
        events={state.events}
        filter={state.filter}
      />
    </Box>
  );
}
