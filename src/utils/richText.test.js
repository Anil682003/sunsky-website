import { describe, it, expect } from 'vitest';
import { parseBlocks, parseInline, hasRichMarkup } from './richText';

/* These markers are the only formatting CMS authors get, because the content
   pipeline has no HTML sanitizer and the CMS write API has no auth. The tests
   that matter most are the ones proving nothing markup-shaped survives as
   markup, and that content written before this existed still reads the same. */

const kinds = (line) => parseInline(line).map((r) => `${r.kind}:${r.text}`);

describe('parseInline', () => {
  it('marks bold and highlight runs', () => {
    expect(kinds('a **b** c')).toEqual(['text:a ', 'bold:b', 'text: c']);
    expect(kinds('a ==b== c')).toEqual(['text:a ', 'mark:b', 'text: c']);
  });

  it('handles both markers in one line', () => {
    expect(kinds('**A** then ==B==')).toEqual(['bold:A', 'text: then ', 'mark:B']);
  });

  it('leaves an unclosed marker as literal text', () => {
    expect(kinds('a ** b')).toEqual(['text:a ** b']);
    expect(kinds('50% == 50%')).toEqual(['text:50% == 50%']);
  });

  it('leaves an empty marker pair as literal text', () => {
    expect(kinds('a **** b')).toEqual(['text:a **** b']);
  });

  it('does not treat a single asterisk as bold', () => {
    expect(kinds('5 * 3 = 15')).toEqual(['text:5 * 3 = 15']);
  });

  /* The whole safety argument in one test: angle brackets stay text. */
  it('never turns markup into anything but text', () => {
    expect(kinds('<script>alert(1)</script>')).toEqual(['text:<script>alert(1)</script>']);
    expect(kinds('<b>**x**</b>')).toEqual(['text:<b>', 'bold:x', 'text:</b>']);
  });
});

describe('parseBlocks', () => {
  it('splits paragraphs on blank lines', () => {
    const b = parseBlocks('one\n\ntwo');
    expect(b).toHaveLength(2);
    expect(b.every((x) => x.type === 'p')).toBe(true);
  });

  it('keeps single newlines inside one paragraph', () => {
    const b = parseBlocks('line one\nline two');
    expect(b).toHaveLength(1);
    expect(b[0].lines).toEqual(['line one', 'line two']);
  });

  it('turns a run of dashes into one list', () => {
    const b = parseBlocks('- a\n- b\n- c');
    expect(b).toHaveLength(1);
    expect(b[0].type).toBe('ul');
    expect(b[0].lines).toEqual(['a', 'b', 'c']);
  });

  it('accepts a dash, an asterisk or a bullet character', () => {
    expect(parseBlocks('- a\n* b\n• c')[0].lines).toEqual(['a', 'b', 'c']);
  });

  /* The reason for the whole change: a list in the MIDDLE of a section. */
  it('allows a list between two paragraphs, with no blank line needed', () => {
    const b = parseBlocks('Intro text\n- one\n- two\nClosing text');
    expect(b.map((x) => x.type)).toEqual(['p', 'ul', 'p']);
    expect(b[1].lines).toEqual(['one', 'two']);
    expect(b[2].lines).toEqual(['Closing text']);
  });

  it('carries inline formatting inside a list item', () => {
    const b = parseBlocks('- a **bold** item');
    expect(kinds(b[0].lines[0])).toEqual(['text:a ', 'bold:bold', 'text: item']);
  });

  it('returns nothing for empty or blank input', () => {
    expect(parseBlocks('')).toEqual([]);
    expect(parseBlocks('   \n\n  ')).toEqual([]);
    expect(parseBlocks(null)).toEqual([]);
    expect(parseBlocks(undefined)).toEqual([]);
  });

  /* Content written before any of this existed must render exactly as before. */
  it('leaves plain legacy content as plain paragraphs', () => {
    const legacy = 'Artikel 5 - Prijzen en betalingen\n\nDe prijsinformatie die vóór de boeking wordt verstrekt.';
    const b = parseBlocks(legacy);
    expect(b.map((x) => x.type)).toEqual(['p', 'p']);
    expect(b[0].lines[0]).toBe('Artikel 5 - Prijzen en betalingen');
  });

  it('does not mistake a mid-line dash for a bullet', () => {
    const b = parseBlocks('Algemene Reisvoorwaarden - Pakketreizen');
    expect(b[0].type).toBe('p');
  });

  it('honours the <br> the CMS already stores, via cmsText', () => {
    const b = parseBlocks('one<br>two');
    expect(b).toHaveLength(1);
    expect(b[0].lines).toEqual(['one', 'two']);
  });
});

describe('hasRichMarkup', () => {
  it('spots each marker', () => {
    expect(hasRichMarkup('a **b**')).toBe(true);
    expect(hasRichMarkup('a ==b==')).toBe(true);
    expect(hasRichMarkup('- a')).toBe(true);
  });

  it('is false for plain prose', () => {
    expect(hasRichMarkup('Algemene Reisvoorwaarden - Pakketreizen')).toBe(false);
    expect(hasRichMarkup('')).toBe(false);
  });
});
