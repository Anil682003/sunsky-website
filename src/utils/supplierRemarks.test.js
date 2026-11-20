import { describe, it, expect } from 'vitest';
import { remarksParagraphs, remarksOfRate, hasRemarks } from './supplierRemarks';

// The client's rule (Levent, 20 Nov 2026): the COMPLETE original supplier text, paragraphs and
// line breaks kept, nothing filtered, shortened, rewritten, translated or split into points.

describe('remarksParagraphs', () => {
  it('keeps a one-paragraph Hotelbeds remark word for word, cancellation wording included', () => {
    const hb = 'Car park YES (without additional debit notes). Check-in hour 14:00 - 00:00. Check-out hour 12:00 - . '
      + 'Cancellations made after 01/09/2027 are charged 100%. Identification card at arrival.';
    expect(remarksParagraphs(hb)).toEqual([hb.trim()]);
  });

  it('keeps the supplier paragraphs and the line breaks inside them', () => {
    const raw = 'Minimum age 18 years (Adults only).\nCheck-in from 14:00.\n\nDeposit required on arrival.\r\nPet friendly: no.';
    expect(remarksParagraphs(raw)).toEqual([
      'Minimum age 18 years (Adults only).\nCheck-in from 14:00.',
      'Deposit required on arrival.\nPet friendly: no.',
    ]);
  });

  it('turns HTML breaks into real ones, also when they arrive escaped (World2Meet)', () => {
    const w2m = '* Services valid in summer.&lt;br&gt;In winter some services are limited.&lt;br&gt;&lt;br&gt;TAX&lt;br/&gt;Local taxes might be payable on spot.';
    expect(remarksParagraphs(w2m)).toEqual([
      '* Services valid in summer.\nIn winter some services are limited.',
      'TAX\nLocal taxes might be payable on spot.',
    ]);
  });

  it('drops markup tags but never the words or a bare comparison sign', () => {
    expect(remarksParagraphs('<b>Note</b>: children < 12 and > 2 stay free &amp; eat free.'))
      .toEqual(['Note: children < 12 and > 2 stay free & eat free.']);
  });

  it('a list of remarks keeps each one as its own paragraph, in the order sent', () => {
    expect(remarksParagraphs(['First remark.', '  ', 'Second remark.'])).toEqual(['First remark.', 'Second remark.']);
  });

  it('nothing to say is nothing to show', () => {
    for (const none of [null, undefined, '', '   ', '<br/>', [], [null, '']]) {
      expect(remarksParagraphs(none)).toEqual([]);
      expect(hasRemarks(none)).toBe(false);
    }
  });
});

describe('remarksOfRate', () => {
  it('prefers the remarks the live room carries itself', () => {
    expect(remarksOfRate({ rateComments: 'From the room.' }, 'From the rate check.')).toBe('From the room.');
  });

  it('falls back to the rate check (Hotelbeds states them only there)', () => {
    expect(remarksOfRate({ rateKey: 'K' }, 'From the rate check.')).toBe('From the rate check.');
  });

  it('no room, or no text anywhere, is null', () => {
    expect(remarksOfRate(null, 'x')).toBeNull();
    expect(remarksOfRate({ rateKey: 'K' }, '  ')).toBeNull();
  });
});
