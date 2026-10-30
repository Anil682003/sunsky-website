import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

vi.mock('../services/axiosInstance', () => ({
  default: vi.fn(() => Promise.reject(Object.assign(new Error('Network Error'), { response: undefined }))),
}));

import useApi from './useApi';

// A failed automatic load used to escape as an unhandled rejection: execute() re-throws for callers
// that await it, and the immediate load is awaited by nobody. In the browser that was an
// "Uncaught (in promise)" on every failed page request; in vitest it failed whole test files.
describe('useApi', () => {
  const seen = [];
  const onRejection = (reason) => { seen.push(reason); };
  afterEach(() => {
    process.off('unhandledRejection', onRejection);
    seen.length = 0;
  });

  it('a failed immediate GET lands in `error` and leaves no unhandled rejection', async () => {
    process.on('unhandledRejection', onRejection);
    const { result } = renderHook(() => useApi('/cms/layout/homepage-config', { immediate: true, errorMessage: 'Could not load' }));
    await waitFor(() => expect(result.current.error).toBe('Could not load'));
    // Give a leaked rejection a chance to surface before checking.
    await new Promise((r) => setTimeout(r, 20));
    expect(seen).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('a caller that awaits execute() still gets the error', async () => {
    const { result } = renderHook(() => useApi('/anything'));
    let caught = null;
    await act(async () => {
      try { await result.current.execute(); } catch (err) { caught = err; }
    });
    expect(caught?.message).toBe('Network Error');
  });
});
