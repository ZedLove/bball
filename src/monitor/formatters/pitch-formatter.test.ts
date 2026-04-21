import { describe, it, expect } from 'vitest';
import { abbreviateCall } from './pitch-formatter.ts';

describe('abbreviateCall', () => {
  it.each([
    ['Ball', 'B'],
    ['Called Strike', 'CS'],
    ['Swinging Strike', 'SS'],
    ['Swinging Strike (Blocked)', 'SS(B)'],
    ['Foul', 'F'],
    ['Foul Tip', 'FT'],
    ['Foul Bunt', 'FB'],
    ['In play, out(s)', 'IP(O)'],
    ['In play, run(s)', 'IP(R)'],
    ['In play, no out', 'IP'],
    ['Intent Ball', 'IB'],
    ['Pitchout', 'PO'],
    ['Automatic Ball', 'AB'],
    ['Automatic Strike', 'AS'],
    ['No Pitch', 'NP'],
    ['Missed Bunt', 'MB'],
    ['Foul Pitchout', 'FP'],
    ['Hit By Pitch', 'HBP'],
  ] as [string, string][])('"%s" → "%s"', (call, expected) => {
    expect(abbreviateCall(call)).toBe(expected);
  });

  it('unknown call string returns "??"', () => {
    expect(abbreviateCall('Some Unknown Call')).toBe('??');
  });

  it('empty string returns "??"', () => {
    expect(abbreviateCall('')).toBe('??');
  });
});
