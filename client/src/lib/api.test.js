import { beforeEach, describe, expect, it, vi } from 'vitest';
import { savePredictionShortlist } from './api';

describe('api client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('posts ML predictions to the shortlist prediction endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ shortlist: { _id: 'shortlist-1' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await savePredictionShortlist({
      institute: 'Indian Institute of Technology Test',
      program: 'Computer Science',
      quota: 'AI',
      seatType: 'OPEN',
      gender: 'Gender-Neutral',
      openingRank: 1000,
      closingRank: 2000,
      probability: 92,
    });

    expect(result).toEqual({ shortlist: { _id: 'shortlist-1' } });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:5000/api/shortlists/prediction',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: expect.stringContaining('"probability":92'),
      }),
    );
  });
});
