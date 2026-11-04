import { describe, it, expect } from 'vitest';
import { searchGate, unreachableFromAll } from './searchGate';

const base = { transport: 'package', destinationCodes: ['AYT'], state: 'ok' };

describe('searchGate', () => {
  it('an airport that flies there: search', () => {
    expect(searchGate({ ...base, chosenOrigins: ['BRU'], reachable: new Set(['BRU']) })).toBe('ok');
  });
  it('OR: one of several ticked airports is enough', () => {
    expect(searchGate({ ...base, chosenOrigins: ['ANR', 'BRU'], reachable: new Set(['BRU']) })).toBe('ok');
  });
  it('no ticked airport flies there: blocked', () => {
    expect(searchGate({ ...base, chosenOrigins: ['ANR', 'CRL'], reachable: new Set(['BRU']) })).toBe('none');
  });
  it('no preference: blocked only when no airport at all flies there', () => {
    expect(searchGate({ ...base, chosenOrigins: [], reachable: new Set(['BRU']) })).toBe('ok');
    expect(searchGate({ ...base, chosenOrigins: [], reachable: new Set() })).toBe('none');
  });
  it('while checking: wait', () => {
    expect(searchGate({ ...base, chosenOrigins: ['BRU'], reachable: null, state: 'loading' })).toBe('checking');
  });
  it('a failed check never blocks', () => {
    expect(searchGate({ ...base, chosenOrigins: ['BRU'], reachable: null, state: 'error' })).toBe('ok');
  });
  it('a country pick (nothing checkable) and Hotel Only never block', () => {
    expect(searchGate({ ...base, destinationCodes: [], chosenOrigins: ['ANR'], reachable: new Set() })).toBe('ok');
    expect(searchGate({ ...base, transport: 'hotel', chosenOrigins: ['ANR'], reachable: new Set() })).toBe('ok');
  });
});

describe('unreachableFromAll', () => {
  it('greys only what every ticked airport cannot reach', () => {
    const r = unreachableFromAll([new Set(['AYT', 'JFK']), new Set(['JFK'])]);
    expect([...r]).toEqual(['JFK']);
  });
  it('one unknown answer: grey nothing', () => {
    expect(unreachableFromAll([new Set(['JFK']), null])).toBeNull();
  });
});
