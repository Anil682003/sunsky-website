/**
 * The hotel supplier's remarks for the selected rate, as paragraphs to print (Supplier Remarks
 * Frontend Implementation, Levent 20 Nov 2026).
 *
 * The rule is "the complete original text": nothing filtered, shortened, reworded, translated or
 * split into points, and the cancellation wording stays in. So this only undoes TRANSPORT
 * formatting, never content:
 *   - a supplier that sends HTML line breaks (`<br>`, `</p>`, World2Meet does) gets real ones;
 *   - entity-escaped text (`&lt;br&gt;`, `&amp;`) is unescaped first, so a double-escaped break
 *     is still a break and an ampersand prints as one;
 *   - any other markup tag is dropped (its words stay), because the remarks render as text and a
 *     literal "<b>" would be noise, not information. A bare "<" or ">" in a sentence is kept.
 *   - blank lines separate paragraphs; a single line break stays a line break inside one.
 *
 * Accepts the API's string, or a list of strings (each its own paragraph). Returns [] when there
 * is nothing to show, which hides the section.
 *
 * @param {string|string[]|null|undefined} raw
 * @returns {string[]} paragraphs, each possibly holding "\n" line breaks
 */
export function remarksParagraphs(raw) {
  const parts = Array.isArray(raw) ? raw : [raw];
  const text = parts
    .filter((p) => typeof p === 'string')
    .map(clean)
    .filter(Boolean)
    .join('\n\n');
  if (!text) return [];
  return text
    .split(/\n[ \t]*\n+/)
    .map((p) => p.replace(/^\n+|\n+$/g, ''))
    .filter((p) => p.trim() !== '');
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

function decodeEntities(s) {
  // Twice at most: "&amp;lt;br&amp;gt;" is a break that was escaped two times over.
  let out = s;
  for (let i = 0; i < 2; i += 1) {
    const next = out.replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/gi, (_, e) => ENTITIES[e.toLowerCase()]);
    if (next === out) break;
    out = next;
  }
  return out;
}

function clean(s) {
  return decodeEntities(s)
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<\/?[a-zA-Z][^<>]*>/g, '')
    // Trailing spaces before a break are invisible and would only stop a blank line reading as one.
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/**
 * The same remarks as blocks to LAY OUT (Levent, 26 Nov 2026: the full text read "like a
 * newspaper", Ana y Jose Holbox via World2Meet). Every word stays, in the supplier's order; only
 * the layout uses what the text already says:
 *   - a short line of its own ending in ":" ("Fees:", "Checkin Instructions:") is the supplier's
 *     own heading, printed as one;
 *   - such a heading whose next paragraph is one short line ("Checkin Time:" / "3:00 PM") is a
 *     label and its value, printed side by side ({ type: 'fact' });
 *   - list items the supplier ran together with no space or stop ("per personAirport shuttle fee",
 *     "accessBeach loungers") start on their own line, and a full stop with no space after it
 *     gets one ("arrival.Parties" -> "arrival. Parties").
 *
 * @returns {Array<{type:'heading', text:string}|{type:'fact', label:string, value:string}|{type:'para', text:string}>}
 */
export function remarksBlocks(raw) {
  const paras = remarksParagraphs(raw);
  const out = [];
  for (let i = 0; i < paras.length; i += 1) {
    const p = paras[i];
    const lines = p.split('\n');
    const first = lines[0].trim();
    if (isHeading(first)) {
      const label = first.replace(/:\s*$/, '');
      const rest = lines.slice(1).join('\n').trim();
      const next = paras[i + 1];
      if (!rest && label.length <= 40 && next && isShortValue(next)) {
        out.push({ type: 'fact', label, value: next.trim() });
        i += 1;
        continue;
      }
      out.push({ type: 'heading', text: label });
      if (rest) out.push({ type: 'para', text: unglue(rest) });
      continue;
    }
    // A title line with no colon over the lines it introduces ("Fees to be paid at destination",
    // "MEXICAN GENERAL TOURISM LAW"): short, two words or more, no closing punctuation, and more
    // lines follow in the same paragraph.
    if (lines.length >= 2 && isTitleLine(first) && lines.slice(1).join('').trim()) {
      out.push({ type: 'heading', text: first });
      out.push({ type: 'para', text: unglue(lines.slice(1).join('\n').trim()) });
      continue;
    }
    out.push({ type: 'para', text: unglue(p) });
  }
  return out;
}

const isHeading = (line) => line.length >= 3 && line.length <= 60 && /:\s*$/.test(line) && !/^\d/.test(line);
const isTitleLine = (line) => line.length >= 6 && line.length <= 50 && /\s/.test(line) && /^[A-Za-zÀ-ÿ]/.test(line)
  && !/[.,;:!?)\]]\s*$/.test(line) && !/\d{2,}/.test(line);
// A value is a few words ("3:00 PM", "18", "1 King Bed"): a line ending in "." (or "!" / "?") is
// a sentence under a heading, not a value ("Checkin Instructions:" / "Bring photo ID.").
const isShortValue = (p) => !p.includes('\n') && p.trim().length <= 40 && !/[:.!?]\s*$/.test(p.trim());

// Three lower-case letters (or a closing bracket) straight into a capitalised word: two list items
// run together ("per personAirport shuttle", "(roundtrip)Airport"). Fewer than three (iPad,
// McDonald's, PayPal) is a name. Split ONLY where a paragraph has two or more such joins: a list
// the supplier glued has many ("Beach accessBeach loungersBeach towels…"), a brand written as one
// word (WhatsApp, PortAventura) appears once. Names in NEVER_SPLIT are never split either way.
// A colon or full stop with no space before a capital gets one ("includes:Beach", "arrival.Parties");
// times (3:00) and links (https://) do not. Only whitespace is ever added: no character changes.
const WORD = '[A-Z][a-z](?:[a-z]|-[a-z])';   // "Beach", "In-room"
const JOIN = new RegExp(`([a-z]{3,}|\\))(${WORD})`, 'g');
export const NEVER_SPLIT = Object.freeze([
  'WhatsApp', 'PortAventura', 'MasterCard', 'PlayStation', 'TripAdvisor', 'FaceTime', 'SeaWorld',
  'YouTube', 'LinkedIn', 'PayPal', 'DoubleTree', 'AccorHotels', 'SmartTV', 'SkyDrive', 'BlackBerry',
  'GoPro', 'SpongeBob', 'WiFi', 'eDreams', 'TikTok', 'FlixBus', 'LastMinute',
]);

/** Whether position `at` falls inside one of the protected names. */
function inProtectedName(text, at) {
  for (const name of NEVER_SPLIT) {
    let i = text.indexOf(name);
    while (i >= 0) {
      if (at > i && at < i + name.length) return true;
      i = text.indexOf(name, i + 1);
    }
  }
  return false;
}

function unglue(s) {
  const spaced = s
    .replace(/([a-z]{2,})\.([A-Z][a-z])/g, '$1. $2')
    .replace(/([a-z]{2,}):([A-Z])/g, '$1: $2');
  const joins = [...spaced.matchAll(JOIN)].filter((m) => !inProtectedName(spaced, m.index + m[1].length));
  if (joins.length < 2) return spaced;
  return spaced.replace(JOIN, (all, a, b, offset) => (inProtectedName(spaced, offset + a.length) ? all : `${a}\n${b}`));
}

/** Whether there is anything to show: the section is hidden, not empty, when there is not. */
export const hasRemarks = (raw) => remarksParagraphs(raw).length > 0;

/**
 * Where a selected rate's remarks come from. A live room may carry them itself (a supplier whose
 * availability answer includes them); Hotelbeds states them only in its rate check, which the hotel
 * page already runs for the selected rate (`checked`). The room's own text wins: it is the
 * newer answer for exactly that rate.
 */
export function remarksOfRate(room, checked = null) {
  if (!room) return null;
  const own = room.rateComments ?? room.remarks ?? null;
  if (hasRemarks(own)) return own;
  return hasRemarks(checked) ? checked : null;
}
