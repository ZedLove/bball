import { vi, describe, it, expect, afterEach } from 'vitest';
import axios from 'axios';
import { fetchBoxscore } from './boxscore-client.ts';

const mockGet = vi.spyOn(axios, 'get');

afterEach(() => mockGet.mockReset());

describe('fetchBoxscore', () => {
  it('calls the boxscore endpoint with the correct gamePk', async () => {
    mockGet.mockResolvedValueOnce({ data: {} });

    await fetchBoxscore(823963);

    expect(mockGet).toHaveBeenCalledOnce();
    expect(mockGet).toHaveBeenCalledWith(
      'https://statsapi.mlb.com/api/v1/game/823963/boxscore',
      expect.objectContaining({ timeout: 8_000 }),
    );
  });

  it('returns response.data', async () => {
    const mockData = { topPerformers: [] };
    mockGet.mockResolvedValueOnce({ data: mockData });

    const result = await fetchBoxscore(823963);

    expect(result).toEqual(mockData);
  });

  it('propagates axios errors to the caller', async () => {
    mockGet.mockRejectedValueOnce(new Error('network timeout'));

    await expect(fetchBoxscore(823963)).rejects.toThrow('network timeout');
  });
});
