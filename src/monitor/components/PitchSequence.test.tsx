import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { PitchSequence } from './PitchSequence.tsx';
import type { PitchEvent } from '../../server/socket-events.ts';

function makePitch(overrides: Partial<PitchEvent> = {}): PitchEvent {
  return {
    pitchNumber: 1,
    pitchType: 'Four-Seam Fastball',
    pitchTypeCode: 'FF',
    call: 'Ball',
    isBall: true,
    isStrike: false,
    isInPlay: false,
    speedMph: 96,
    countAfter: { balls: 1, strikes: 0 },
    tracking: null,
    hitData: null,
    ...overrides,
  };
}

describe('PitchSequence', () => {
  describe('empty sequence', () => {
    it('renders nothing when pitchSequence is empty', () => {
      const { lastFrame } = render(
        <PitchSequence pitchSequence={[]} mode="all" />
      );
      expect(lastFrame()).toBe('');
    });
  });

  describe('mode: all', () => {
    it('renders all pitches in order (oldest first, newest last)', () => {
      const pitches = [
        makePitch({
          pitchNumber: 1,
          pitchTypeCode: 'FF',
          speedMph: 96,
          call: 'Ball',
        }),
        makePitch({
          pitchNumber: 2,
          pitchTypeCode: 'SL',
          speedMph: 84,
          call: 'Called Strike',
        }),
        makePitch({
          pitchNumber: 3,
          pitchTypeCode: 'FF',
          speedMph: 95,
          call: 'Swinging Strike',
        }),
      ];
      const { lastFrame } = render(
        <PitchSequence pitchSequence={pitches} mode="all" />
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('FF 96mph B');
      expect(frame).toContain('SL 84mph CS');
      expect(frame).toContain('FF 95mph SS');
    });

    it('caps at 10 pitches — drops oldest', () => {
      const pitches = Array.from({ length: 12 }, (_, i) =>
        makePitch({
          pitchNumber: i + 1,
          pitchTypeCode: `P${i + 1}`,
          call: 'Ball',
        })
      );
      const { lastFrame } = render(
        <PitchSequence pitchSequence={pitches} mode="all" />
      );
      const frame = lastFrame() ?? '';
      // P1 and P2 (oldest) should be dropped
      expect(frame).not.toContain('P1 ');
      expect(frame).not.toContain('P2 ');
      // P3–P12 should be visible
      expect(frame).toContain('P3');
      expect(frame).toContain('P12');
    });
  });

  describe('mode: last', () => {
    it('renders only the most recent pitch', () => {
      const pitches = [
        makePitch({ pitchNumber: 1, pitchTypeCode: 'FF', call: 'Ball' }),
        makePitch({
          pitchNumber: 2,
          pitchTypeCode: 'SL',
          call: 'Called Strike',
        }),
        makePitch({
          pitchNumber: 3,
          pitchTypeCode: 'CH',
          call: 'Swinging Strike',
        }),
      ];
      const { lastFrame } = render(
        <PitchSequence pitchSequence={pitches} mode="last" />
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('CH');
      expect(frame).not.toContain('FF 96');
      expect(frame).not.toContain('SL');
    });
  });

  describe('null fallbacks', () => {
    it('renders full pitchType when pitchTypeCode is null', () => {
      const pitch = makePitch({
        pitchTypeCode: null,
        pitchType: 'Knuckle Curve',
        call: 'Ball',
      });
      const { lastFrame } = render(
        <PitchSequence pitchSequence={[pitch]} mode="all" />
      );
      expect(lastFrame()).toContain('Knuckle Curve');
    });

    it('renders ??mph when speedMph is null', () => {
      const pitch = makePitch({ speedMph: null, call: 'Ball' });
      const { lastFrame } = render(
        <PitchSequence pitchSequence={[pitch]} mode="all" />
      );
      expect(lastFrame()).toContain('??mph');
    });
  });

  describe('call abbreviations in pitch lines', () => {
    it.each([
      ['Ball', 'B'],
      ['Called Strike', 'CS'],
      ['Swinging Strike', 'SS'],
      ['Foul', 'F'],
      ['In play, run(s)', 'IP(R)'],
      ['In play, out(s)', 'IP(O)'],
    ] as [string, string][])(
      'call "%s" displays as "%s" in the pitch line',
      (call, expectedAbbrev) => {
        const pitch = makePitch({ call });
        const { lastFrame } = render(
          <PitchSequence pitchSequence={[pitch]} mode="all" />
        );
        expect(lastFrame()).toContain(expectedAbbrev);
      }
    );
  });
});
