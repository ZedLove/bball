import { vi, describe, it, expect, afterEach } from 'vitest';
import axios from 'axios';
import { fetchGameFeed } from './game-feed-client.ts';

const mockGet = vi.spyOn(axios, 'get');

afterEach(() => mockGet.mockReset());

describe('fetchGameFeed', () => {
  it('calls the diffPatch endpoint with the correct gamePk and startTimecode', async () => {
    mockGet.mockResolvedValueOnce({ data: {} });

    await fetchGameFeed(823963, '20260415_180000');

    expect(mockGet).toHaveBeenCalledOnce();
    expect(mockGet).toHaveBeenCalledWith(
      'https://statsapi.mlb.com/api/v1.1/game/823963/feed/live/diffPatch?startTimecode=20260415_180000',
      expect.objectContaining({ timeout: 8_000 }),
    );
  });

  it('URL-encodes the startTimecode', async () => {
    mockGet.mockResolvedValueOnce({ data: {} });

    await fetchGameFeed(823963, '20260415_18:00:00');

    const calledUrl = mockGet.mock.calls[0][0] as string;
    expect(calledUrl).toContain('startTimecode=20260415_18%3A00%3A00');
  });

  it('returns response.data', async () => {
    const mockData = { metaData: { timeStamp: '20260416_044805' } };
    mockGet.mockResolvedValueOnce({ data: mockData });

    const result = await fetchGameFeed(823963, '20260415_000000');

    expect(result).toEqual(mockData);
  });

  it('returns null when the API returns an empty array (no new events since cursor)', async () => {
    mockGet.mockResolvedValueOnce({ data: [] });

    const result = await fetchGameFeed(823963, '20260415_000000');

    expect(result).toBeNull();
  });

  it('propagates axios errors to the caller', async () => {
    mockGet.mockRejectedValueOnce(new Error('network timeout'));

    await expect(fetchGameFeed(823963, '20260415_000000')).rejects.toThrow('network timeout');
  });
});
