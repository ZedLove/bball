import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { StatusBar } from './StatusBar.tsx';

describe('StatusBar', () => {
  describe('connection status', () => {
    it('shows Connected when connectedAt is set', () => {
      const { lastFrame } = render(
        <StatusBar connectedAt={new Date()} filter="all" pitchDisplay="all" />
      );
      expect(lastFrame()).toContain('Connected:');
    });

    it('shows Disconnected when connectedAt is null', () => {
      const { lastFrame } = render(
        <StatusBar connectedAt={null} filter="all" pitchDisplay="all" />
      );
      expect(lastFrame()).toContain('Disconnected');
    });

    it('does not show "Connected" text when disconnected', () => {
      const { lastFrame } = render(
        <StatusBar connectedAt={null} filter="all" pitchDisplay="all" />
      );
      expect(lastFrame()).not.toContain('Connected:');
    });
  });

  describe('filter display', () => {
    it('shows [a] ALL and [s] Scoring keyboard hints', () => {
      const { lastFrame } = render(
        <StatusBar connectedAt={null} filter="all" pitchDisplay="all" />
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('[a] ALL');
      expect(frame).toContain('[s] Scoring');
    });

    it('shows [p] pitch mode hint', () => {
      const { lastFrame } = render(
        <StatusBar connectedAt={null} filter="all" pitchDisplay="at-bat" />
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('[p]');
      expect(frame).toContain('last');
      expect(frame).toContain('at-bat');
      expect(frame).toContain('all');
    });

    it('shows [q] Quit hint', () => {
      const { lastFrame } = render(
        <StatusBar connectedAt={null} filter="all" pitchDisplay="at-bat" />
      );
      expect(lastFrame()).toContain('[q] Quit');
    });
  });

  describe('pitch display mode', () => {
    it('renders all three mode labels', () => {
      const { lastFrame } = render(
        <StatusBar connectedAt={null} filter="all" pitchDisplay="at-bat" />
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('last');
      expect(frame).toContain('at-bat');
      expect(frame).toContain('all');
    });

    it('renders last mode without errors', () => {
      const { lastFrame } = render(
        <StatusBar connectedAt={null} filter="all" pitchDisplay="last" />
      );
      expect(lastFrame()).toContain('last');
    });

    it('renders all mode without errors', () => {
      const { lastFrame } = render(
        <StatusBar connectedAt={null} filter="all" pitchDisplay="all" />
      );
      expect(lastFrame()).toContain('all');
    });
  });
});
