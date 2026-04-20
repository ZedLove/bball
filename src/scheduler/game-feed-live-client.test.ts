import { vi, describe, it, expect, afterEach } from 'vitest';
import axios from 'axios';
import { fetchGameFeedLive } from './game-feed-live-client.ts';

const mockGet = vi.spyOn(axios, 'get');

afterEach(() => mockGet.mockReset());

describe('fetchGameFeedLive', () => {
  it('calls the feed/live endpoint with the correct gamePk', async () => {
    mockGet.mockResolvedValueOnce({ data: {} });

    await fetchGameFeedLive(822750);

    expect(mockGet).toHaveBeenCalledOnce();
    expect(mockGet).toHaveBeenCalledWith(
      'https://statsapi.mlb.com/api/v1.1/game/822750/feed/live',
      expect.objectContaining({ timeout: 8_000 }),
    );
  });

  it('constructs a distinct URL for different gamePks', async () => {
    mockGet.mockResolvedValueOnce({ data: {} });

    await fetchGameFeedLive(999999);

    const calledUrl = mockGet.mock.calls[0][0] as string;
    expect(calledUrl).toBe('https://statsapi.mlb.com/api/v1.1/game/999999/feed/live');
  });

  it('sends the correct User-Agent header', async () => {
    mockGet.mockResolvedValueOnce({ data: {} });

    await fetchGameFeedLive(822750);

    expect(mockGet).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: { 'User-Agent': 'mlb-gameday-ping/0.1' } }),
    );
  });

  it('returns response.data typed as GameFeedLiveResponse', async () => {
    const mockData = {
      liveData: {
        plays: { currentPlay: null },
      },
    };
    mockGet.mockResolvedValueOnce({ data: mockData });

    const result = await fetchGameFeedLive(822750);

    expect(result).toEqual(mockData);
  });

  it('propagates network errors to the caller', async () => {
    mockGet.mockRejectedValueOnce(new Error('network timeout'));

    await expect(fetchGameFeedLive(822750)).rejects.toThrow('network timeout');
  });

  it('propagates non-2xx HTTP errors to the caller', async () => {
    const axiosError = Object.assign(new Error('Request failed with status code 503'), {
      response: { status: 503 },
    });
    mockGet.mockRejectedValueOnce(axiosError);

    await expect(fetchGameFeedLive(822750)).rejects.toThrow('503');
  });
});
