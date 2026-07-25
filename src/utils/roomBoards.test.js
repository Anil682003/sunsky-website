import { describe, it, expect } from 'vitest';
import { groupRoomsByBoard, boardCount, NO_BOARD_LABEL } from './roomBoards';

// Shapes mirror what HotelDetail builds from /hotel-availability/search.
const rate = (o) => ({
  name: 'Double', roomCode: 'DBL', board: 'Room Only', boardCode: 'RO',
  price: 100, currency: 'EUR', supplier: 'hotelbeds', rateKey: 'k', ...o,
});

describe('groupRoomsByBoard', () => {
  it('collapses a room\'s many rates into one card per board', () => {
    // Real Mallorca shape: the same room+board repeats once per rate class.
    const groups = groupRoomsByBoard([
      rate({ price: 330.42, board: 'Room Only', boardCode: 'RO' }),
      rate({ price: 348.54, board: 'Room Only', boardCode: 'RO' }),
      rate({ price: 348.54, board: 'Room Only', boardCode: 'RO' }),
      rate({ price: 350.55, board: 'Bed and Breakfast', boardCode: 'BB' }),
      rate({ price: 384.81, board: 'Half Board', boardCode: 'HB' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].boards.map((b) => b.boardLabel)).toEqual(['Room Only', 'Bed and Breakfast', 'Half Board']);
    expect(groups[0].boards[0].price).toBe(330.42);   // the cheapest Room Only, not all three
  });

  it('surfaces a board that the old price-sorted cut would have hidden', () => {
    // The whole point: Half Board exists, but never inside the five cheapest rates.
    const rates = [
      ...Array.from({ length: 8 }, (_, i) => rate({ name: `Room ${i}`, roomCode: `R${i}`, price: 100 + i })),
      rate({ name: 'Room 0', roomCode: 'R0', board: 'Half Board', boardCode: 'HB', price: 400 }),
    ];
    const groups = groupRoomsByBoard(rates);
    const room0 = groups.find((g) => g.name === 'Room 0');
    expect(room0.boards.map((b) => b.boardLabel)).toEqual(['Room Only', 'Half Board']);
    expect(boardCount(groups)).toBe(2);
  });

  it('orders rooms by their cheapest option, and boards within a room by price', () => {
    const groups = groupRoomsByBoard([
      rate({ name: 'Suite', roomCode: 'SUI', price: 500, boardCode: 'HB', board: 'Half Board' }),
      rate({ name: 'Suite', roomCode: 'SUI', price: 300, boardCode: 'RO', board: 'Room Only' }),
      rate({ name: 'Twin', roomCode: 'TWN', price: 200, boardCode: 'RO', board: 'Room Only' }),
      rate({ name: 'Twin', roomCode: 'TWN', price: 250, boardCode: 'BB', board: 'Bed and Breakfast' }),
    ]);
    expect(groups.map((g) => g.name)).toEqual(['Twin', 'Suite']);
    expect(groups[0].boards.map((b) => b.price)).toEqual([200, 250]);
    expect(groups[1].boards.map((b) => b.price)).toEqual([300, 500]);
  });

  it('keeps each option pointing at its ORIGINAL rate, so the right rateKey is booked', () => {
    const groups = groupRoomsByBoard([
      rate({ price: 300, boardCode: 'RO', rateKey: 'ro-expensive' }),
      rate({ price: 200, boardCode: 'RO', rateKey: 'ro-cheap' }),
      rate({ price: 400, boardCode: 'HB', board: 'Half Board', rateKey: 'hb' }),
    ]);
    const [ro, hb] = groups[0].boards;
    expect(ro.rateKey).toBe('ro-cheap');
    expect(ro.index).toBe(1);          // index into the INPUT array
    expect(hb.rateKey).toBe('hb');
    expect(hb.index).toBe(2);
  });

  it('exposes the cheapest option of each room', () => {
    const groups = groupRoomsByBoard([
      rate({ price: 500, boardCode: 'AI', board: 'All Inclusive' }),
      rate({ price: 120, boardCode: 'RO' }),
    ]);
    expect(groups[0].cheapest.price).toBe(120);
  });

  it('separates rooms that share a name but not a code', () => {
    const groups = groupRoomsByBoard([
      rate({ name: 'Double Sea View', roomCode: 'DBL-A', price: 100 }),
      rate({ name: 'Double Sea View', roomCode: 'DBL-B', price: 150 }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it('groups by name when no room code is supplied (Diana has none)', () => {
    const groups = groupRoomsByBoard([
      { name: 'Double', board: 'Half Board', price: 200, supplier: 'diana' },
      { name: 'Double', board: 'Room Only', price: 150, supplier: 'diana' },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].boards).toHaveLength(2);
  });

  it('room grouping ignores case and padding in the key', () => {
    const groups = groupRoomsByBoard([
      rate({ name: 'Double', roomCode: ' dbl ', price: 100 }),
      rate({ name: 'Double', roomCode: 'DBL', price: 120, boardCode: 'BB', board: 'Bed and Breakfast' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].boards).toHaveLength(2);
  });

  it('labels a rate with no board rather than inventing a meal plan', () => {
    const groups = groupRoomsByBoard([{ name: 'Double', price: 100 }]);
    expect(groups[0].boards[0].boardLabel).toBe(NO_BOARD_LABEL);
  });

  it('falls back to the board CODE when only the code is present', () => {
    const groups = groupRoomsByBoard([rate({ board: '', boardCode: 'UAI' })]);
    expect(groups[0].boards[0].boardLabel).toBe('UAI');
  });

  it('drops rates with no usable price — they cannot be booked', () => {
    // Note null and '': Number() turns both into 0, which is finite. Without an explicit
    // check they would be offered as free rooms and sort above every real rate.
    const groups = groupRoomsByBoard([
      rate({ price: null }),
      rate({ price: undefined, boardCode: 'BB' }),
      rate({ price: NaN, boardCode: 'HB' }),
      rate({ price: '', boardCode: 'SC' }),
      rate({ price: 0, boardCode: 'FB' }),
      rate({ price: -50, boardCode: 'PB' }),
      rate({ price: 120, boardCode: 'AI', board: 'All Inclusive' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].boards.map((b) => b.boardLabel)).toEqual(['All Inclusive']);
  });

  it('accepts a numeric price given as a string', () => {
    const groups = groupRoomsByBoard([rate({ price: '249.50' })]);
    expect(groups[0].boards[0].price).toBe(249.5);
  });

  it('returns nothing for empty or malformed input instead of throwing', () => {
    expect(groupRoomsByBoard([])).toEqual([]);
    expect(groupRoomsByBoard(null)).toEqual([]);
    expect(groupRoomsByBoard(undefined)).toEqual([]);
    expect(groupRoomsByBoard('nope')).toEqual([]);
    expect(groupRoomsByBoard([{ price: null }])).toEqual([]);
  });

  it('names an unnamed room rather than rendering a blank card', () => {
    const groups = groupRoomsByBoard([{ price: 100, board: 'Room Only' }]);
    expect(groups[0].name).toBe('Room');
  });

  it('handles a big real-world hotel without collapsing distinct inventory', () => {
    // 12 rooms x 3 boards x 4 rate classes = 144 rates in, 12 rooms x 3 boards out.
    const many = [];
    for (let r = 0; r < 12; r++) {
      for (const [code, label] of [['RO', 'Room Only'], ['BB', 'Bed and Breakfast'], ['HB', 'Half Board']]) {
        for (let k = 0; k < 4; k++) {
          many.push(rate({ name: `Room ${r}`, roomCode: `R${r}`, boardCode: code, board: label, price: 100 + r * 10 + k }));
        }
      }
    }
    const groups = groupRoomsByBoard(many);
    expect(groups).toHaveLength(12);
    expect(groups.every((g) => g.boards.length === 3)).toBe(true);
    expect(boardCount(groups)).toBe(3);
  });
});

describe('boardCount', () => {
  it('counts distinct boards across every room', () => {
    const groups = groupRoomsByBoard([
      rate({ name: 'A', roomCode: 'A', boardCode: 'RO', board: 'Room Only', price: 1 }),
      rate({ name: 'B', roomCode: 'B', boardCode: 'RO', board: 'Room Only', price: 2 }),
      rate({ name: 'B', roomCode: 'B', boardCode: 'AI', board: 'All Inclusive', price: 3 }),
    ]);
    expect(boardCount(groups)).toBe(2);
  });

  it('is zero for nothing', () => {
    expect(boardCount([])).toBe(0);
    expect(boardCount(undefined)).toBe(0);
  });
});
