import { describe, it, expect } from 'vitest';
import { hbLanguageFor, localizedDescription } from './hotelContentLanguage';

const rec = (descriptions, flat) => ({ descriptions, description: flat });

describe('hbLanguageFor', () => {
  it('maps our languages to the codes Hotelbeds uses', () => {
    expect(hbLanguageFor('nl')).toBe('HOL');
    expect(hbLanguageFor('en')).toBe('ENG');
  });

  it('reads a regional tag as its base language', () => {
    expect(hbLanguageFor('nl-BE')).toBe('HOL');
    expect(hbLanguageFor('en-GB')).toBe('ENG');
  });

  it('falls back to English for anything it does not know', () => {
    expect(hbLanguageFor('fr')).toBe('ENG');
    expect(hbLanguageFor('')).toBe('ENG');
    expect(hbLanguageFor(undefined)).toBe('ENG');
  });
});

describe('localizedDescription', () => {
  const both = [
    { languageCode: 'ENG', description: 'The hotel is on the seafront.' },
    { languageCode: 'HOL', description: 'Het hotel ligt aan de kust.' },
  ];

  it('gives a Dutch reader the Dutch row', () => {
    expect(localizedDescription(rec(both), 'nl')).toBe('Het hotel ligt aan de kust.');
  });

  it('gives an English reader the English row', () => {
    expect(localizedDescription(rec(both), 'en')).toBe('The hotel is on the seafront.');
  });

  // The backfill skips hotels Hotelbeds has no Dutch text for, so this is the common case for a
  // long tail of properties: English prose beats an empty About block.
  it('falls back to English when the hotel has no Dutch text', () => {
    const engOnly = [{ languageCode: 'ENG', description: 'The hotel is on the seafront.' }];
    expect(localizedDescription(rec(engOnly), 'nl')).toBe('The hotel is on the seafront.');
  });

  it('treats a present-but-blank Dutch row as missing', () => {
    const blankNl = [
      { languageCode: 'ENG', description: 'English text.' },
      { languageCode: 'HOL', description: '   ' },
    ];
    expect(localizedDescription(rec(blankNl), 'nl')).toBe('English text.');
  });

  // Older cached responses, and the admin's own flat field, still carry description on its own.
  it('uses the flat field when there is no descriptions array at all', () => {
    expect(localizedDescription(rec(undefined, 'Flat English text.'), 'nl')).toBe('Flat English text.');
    expect(localizedDescription({ description: 'Flat.' }, 'nl')).toBe('Flat.');
  });

  it('returns an empty string rather than throwing on a missing record', () => {
    expect(localizedDescription(null, 'nl')).toBe('');
    expect(localizedDescription(undefined, 'en')).toBe('');
    expect(localizedDescription({}, 'nl')).toBe('');
  });

  it('trims the text it returns', () => {
    const padded = [{ languageCode: 'HOL', description: '  Het hotel ligt aan de kust.  ' }];
    expect(localizedDescription(rec(padded), 'nl')).toBe('Het hotel ligt aan de kust.');
  });
});
