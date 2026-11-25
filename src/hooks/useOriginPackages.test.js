import { describe, it, expect } from 'vitest';
import { noPackageOrigins } from './useOriginPackages';

describe('noPackageOrigins', () => {
  it('only NONE counts as proof', () => {
    const data = { success: true, origins: { LIL: { status: 'NONE' }, BRU: { status: 'SOME' }, ANR: { status: 'UNKNOWN' } } };
    expect([...noPackageOrigins(data, ['LIL', 'BRU', 'ANR'])]).toEqual(['LIL']);
  });
  it('a failed or partial answer proves nothing', () => {
    expect(noPackageOrigins({ success: false }, ['LIL'])).toBeNull();
    expect(noPackageOrigins(null, ['LIL'])).toBeNull();
    expect(noPackageOrigins({ success: true, origins: { BRU: { status: 'SOME' } } }, ['LIL', 'BRU'])).toBeNull();
  });
});
