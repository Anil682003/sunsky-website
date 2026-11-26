import { describe, it, expect } from 'vitest';
import { remarksParagraphs, remarksOfRate, hasRemarks, remarksBlocks, NEVER_SPLIT } from './supplierRemarks';

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

// The layout of the remarks (26 Nov 2026): only whitespace is added, and the supplier's heading and
// label colons are dropped. Never a character changed, moved or lost.
describe('remarksBlocks: only the layout changes', () => {
  const flat = (s) => String(s).replace(/[\s:]/g, '');
  const rendered = (raw) => remarksBlocks(raw).map((b) => (b.type === 'fact' ? `${b.label}${b.value}` : b.text)).join('');

  const SAMPLES = [
    'Fees:\n\nFee for continental breakfast: approximately USD 25 per personAirport shuttle fee: USD 200 per person (roundtrip)Airport shuttle fee per child: USD 199',
    'The resort fee includes:Beach accessBeach loungersBeach towelsConcierge serviceIn-room safe',
    'Checkin Time:\n\n3:00 PM\n\nCheckout Time:\n\n12:00 PM\n\nCheckin Minimum Age:\n\n18',
    'Contact the hotel via WhatsApp before arrival. Tickets for PortAventura are sold at reception.',
    'Visit https://www.hotel.example/info at 10:30.Free parking. Payment by MasterCard or Visa.',
    '<b>Note:</b> Non-refundable rate.<br>Breakfast 07:00-10:00 &amp; dinner 19:00.',
    'Minimum age 18 years (Adults only).\nCheck-in from 14:00, check-out until 12:00.',
    '',
  ];
  it.each(SAMPLES.map((s, i) => [i, s]))('sample %i keeps every character', (_, s) => {
    const before = remarksParagraphs(s).join('');
    expect(flat(rendered(s))).toBe(flat(before));
  });

  it('a brand written as one word is not split; a glued list is', () => {
    const one = remarksBlocks('Contact us on WhatsApp or via TripAdvisor, and book PortAventura tickets.');
    expect(one[0].text).not.toContain('\n');
    const list = remarksBlocks('Includes: Beach accessBeach loungersBeach towels. Ask on WhatsApp.');
    expect(list[0].text).toBe('Includes: Beach access\nBeach loungers\nBeach towels. Ask on WhatsApp.');
    expect(NEVER_SPLIT).toContain('WhatsApp');
  });

  it('a single join (a name we do not know) is left alone', () => {
    expect(remarksBlocks('Free entry to the AquaZone for guests.')[0].text).toBe('Free entry to the AquaZone for guests.');
  });

  it('times and links are not given spaces', () => {
    const t = remarksBlocks('Open 3:00 PM, see https://Example.org.')[0].text;
    expect(t).toBe('Open 3:00 PM, see https://Example.org.');
  });
});
