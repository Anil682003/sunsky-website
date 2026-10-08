// The session's result_random_seed (final contract, Ch 1 §2): ONE per browsing session, sent with
// every Flight + Hotel search, so a hotel keeps its place in the default (random) order across
// Show more, back navigation and filter changes. sessionStorage: a new tab or a new visit is a new
// session and a new order. Storage blocked (private mode, sandbox): kept in memory for this page.

const KEY = 'sunsky.resultRandomSeed';
const VALID = /^[A-Za-z0-9_-]{1,64}$/;
let memory = null;

const makeSeed = () => {
  try {
    const bytes = new Uint8Array(8);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return Math.random().toString(16).slice(2, 18).padEnd(16, '0');
  }
};

export function resultSeed() {
  try {
    const kept = globalThis.sessionStorage?.getItem(KEY);
    if (kept && VALID.test(kept)) return kept;
  } catch { /* storage blocked: fall through */ }
  if (!memory) memory = makeSeed();
  try { globalThis.sessionStorage?.setItem(KEY, memory); } catch { /* memory only */ }
  return memory;
}

export default resultSeed;
