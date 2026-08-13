import { describe, it, expect } from 'vitest';
import { roomNameFromCode } from './roomNames';

describe('roomNameFromCode', () => {
  it('decodes the room type prefix', () => {
    expect(roomNameFromCode('DBL.SU')).toBe('Superior Double Room');
    expect(roomNameFromCode('SUI.ST')).toBe('Standard Suite');
    expect(roomNameFromCode('JSU.DX')).toBe('Deluxe Junior Suite');
  });

  it('reads the bedroom-count characteristics', () => {
    expect(roomNameFromCode('FAM.1B')).toBe('1 Bedroom Family Room');
    expect(roomNameFromCode('APT.2B')).toBe('2 Bedrooms Apartment');
  });

  it('names the room type alone when the characteristic is not one we can vouch for', () => {
    // VM / WV / CV look like view codes but the catalogue does not say so anywhere we can read.
    expect(roomNameFromCode('DBL.VM')).toBe('Double Room');
    expect(roomNameFromCode('SUI.WV')).toBe('Suite');
    expect(roomNameFromCode('DBL.KG')).toBe('Double Room');
  });

  it('never claims a view it cannot evidence', () => {
    for (const code of ['DBL.VM', 'DBL.CV', 'SUI.GV', 'DBL.SU-WV']) {
      expect(roomNameFromCode(code)).not.toMatch(/view|sea|garden|ocean/i);
    }
  });

  it('keeps the qualifier from a compound characteristic and drops the rest', () => {
    expect(roomNameFromCode('SUI.DX-KG')).toBe('Deluxe Suite');
    expect(roomNameFromCode('DBL.QN-SU')).toBe('Superior Double Room');
  });

  it('ignores the supplier disambiguating suffix', () => {
    expect(roomNameFromCode('DBL.ST-1')).toBe('Standard Double Room');
    expect(roomNameFromCode('DBL.ST-2')).toBe('Standard Double Room');
  });

  it('returns null for an unknown type so the caller falls back to the raw code', () => {
    expect(roomNameFromCode('ZZZ.ST')).toBeNull();
    expect(roomNameFromCode('')).toBeNull();
    expect(roomNameFromCode(null)).toBeNull();
  });

  it('handles a code with no characteristic at all', () => {
    expect(roomNameFromCode('VIL')).toBe('Villa');
    expect(roomNameFromCode('STU')).toBe('Studio');
  });
});
