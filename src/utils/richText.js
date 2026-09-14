import { cmsText } from './cmsText';

/* ═══════════════════════════════════════════════════════════════════════════
   Light formatting for CMS body text.

   The pages that carry SUNSKY's travel conditions run to thousands of words,
   and a wall of undifferentiated prose is genuinely hard to read. Authors need
   bullets in the MIDDLE of a section, a bold lead-in, and the odd highlighted
   sentence.

   What this is NOT is a rich text editor storing HTML. Two facts make that
   unsafe here, and neither has changed:

     1. Nothing in either project sanitises HTML. There is no DOMPurify, no
        allow-list, nothing.
     2. Every /api/cms/* write endpoint is unauthenticated, so the author of a
        page is "anyone who finds the URL".

   Rendering author-supplied HTML under those two conditions is a stored XSS on
   a site that takes card payments. So the content stays PLAIN TEXT, exactly as
   it is stored today, and a handful of markers are parsed into a FIXED set of
   React elements. No HTML string is ever built, and nothing here can produce an
   element that is not in the small list below.

   The markers:
     **bold**        strong emphasis
     ==highlight==   a marked span, for the one line that must not be missed
     - bullet        a line starting with -, * or • becomes a list item, and a
                     run of them becomes one list, anywhere in the section

   Existing content was checked before these were chosen: across every live
   page and FAQ answer there was not a single `**`, `==`, `*`, or line starting
   with a dash, so nothing already written changes meaning.
   ═══════════════════════════════════════════════════════════════════════════ */

/** A line that should become a list item, e.g. "- one", "* two", "• three". */
const BULLET_LINE = /^[ \t]*[-*•][ \t]+(.*)$/;

/**
 * Split text into blocks: paragraphs and bullet lists.
 *
 * A blank line separates paragraphs, which is the convention every CMS field
 * already uses. A run of bullet lines becomes one list, and it does not need a
 * blank line before it: authors type the dash on the next line and expect a
 * list, not a paragraph that happens to start with a dash.
 *
 * @returns {Array<{type:'p'|'ul', lines:string[]}>}
 */
export const parseBlocks = (value) => {
  const text = cmsText(value);
  if (!text.trim()) return [];

  const blocks = [];
  let para = [];
  let list = [];

  const flushPara = () => {
    if (para.length) blocks.push({ type: 'p', lines: para });
    para = [];
  };
  const flushList = () => {
    if (list.length) blocks.push({ type: 'ul', lines: list });
    list = [];
  };

  for (const rawLine of text.split('\n')) {
    const bullet = rawLine.match(BULLET_LINE);

    if (bullet) {
      // A bullet ends the paragraph above it without needing a blank line.
      flushPara();
      list.push(bullet[1].trim());
      continue;
    }

    if (!rawLine.trim()) {
      flushPara();
      flushList();
      continue;
    }

    flushList();
    para.push(rawLine);
  }
  flushPara();
  flushList();

  // A paragraph of only whitespace is not a paragraph.
  return blocks.filter((b) => b.lines.some((l) => l.trim()));
};

/**
 * Split one line into inline runs.
 *
 * Returned as data rather than elements so this stays a plain .js module and
 * can be unit tested without React. The caller turns each run into the one
 * element its kind maps to.
 *
 * An unclosed marker is left alone and reads as literal text, because a stray
 * `**` in a legal document is far likelier to be a typo than an intent to bold
 * the rest of the page.
 *
 * @returns {Array<{kind:'text'|'bold'|'mark', text:string}>}
 */
export const parseInline = (line) => {
  const src = String(line ?? '');
  const runs = [];
  let plain = '';

  const pushPlain = () => {
    if (plain) runs.push({ kind: 'text', text: plain });
    plain = '';
  };

  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    const kind = two === '**' ? 'bold' : two === '==' ? 'mark' : null;

    if (kind) {
      const close = src.indexOf(two, i + 2);
      // Require content between the markers: "****" is not an empty bold.
      if (close > i + 2) {
        pushPlain();
        runs.push({ kind, text: src.slice(i + 2, close) });
        i = close + 2;
        continue;
      }
    }

    plain += src[i];
    i += 1;
  }

  pushPlain();
  return runs;
};

/** True when the text uses any of the markers, so callers can skip the work. */
export const hasRichMarkup = (value) => {
  const text = cmsText(value);
  return /\*\*|==/.test(text) || text.split('\n').some((l) => BULLET_LINE.test(l));
};

export default parseBlocks;
