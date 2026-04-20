import { vi, describe, it, expect, afterEach } from 'vitest';
import axios from 'axios';
import { fetchNextGame } from './next-game-client.ts';

const mockGet = vi.spyOn(axios, 'get');

afterEach(() => mockGet.mockReset());

describe('fetchNextGame', () => {
  it('calls the schedule endpoint with the correct teamId and startDate', async () => {
    mockGet.mockResolvedValueOnce({ data: {} });

    await fetchNextGame(121, '2026-04-16');

    expect(mockGet).toHaveBeenCalledOnce();
    expect(mockGet).toHaveBeenCalledWith(
      'https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=121&startDate=2026-04-16&hydrate=team,probablePitcher',
      expect.objectContaining({ timeout: 8_000 })
    );
  });

  it('returns response.data', async () => {
    const mockData = { dates: [] };
    mockGet.mockResolvedValueOnce({ data: mockData });

    const result = await fetchNextGame(121, '2026-04-16');

    expect(result).toEqual(mockData);
  });

  it('propagates axios errors to the caller', async () => {
    mockGet.mockRejectedValueOnce(new Error('network timeout'));

    await expect(fetchNextGame(121, '2026-04-16')).rejects.toThrow(
      'network timeout'
    );
  });
});
