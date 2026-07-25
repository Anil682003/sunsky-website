// Turn a flat list of live rates into "room type → the board options you can book it on".
//
// WHY THIS EXISTS. A hotel is priced as room-type × board × rate-class, so one hotel can come
// back with 100+ rates. Presented flat and sorted by price, the top of the list is dozens of
// near-identical Room-Only rates and the traveller never sees that Half Board or All Inclusive
// is even offered. (Measured on live Mallorca inventory: "TRH Jardin del Mar" returns 120 rates
// across 3 boards — the 5 cheapest were all Self Catering.)
//
// Two collapses happen here:
//   • by ROOM   — every rate for the same room is one card.
//   • by BOARD  — within a room, the same board appears many times, once per rate class
//                 (refundable / non-refundable / promo). Only the CHEAPEST survives, because a
//                 list showing "Room Only €330, Room Only €348, Room Only €348" is noise.
//
// Each surviving option keeps its ORIGINAL INDEX in the input array, so selection and the
// hand-off to booking (which needs that exact rateKey) stay tied to a real rate.

/** Board shown when a rate carries no board information at all — never invent a meal plan. */
export const NO_BOARD_LABEL = 'Standard rate';

const roomKeyOf = (r) => String(r.roomCode || r.name || 'Room').trim().toLowerCase() || 'room';
const boardKeyOf = (r) => String(r.boardCode || r.board || '').trim().toUpperCase() || '__none__';

/**
 * A bookable price, or null.
 *
 * The null/empty checks come FIRST and are not optional: `Number(null)` and `Number('')` are
 * both 0, which is finite — so a rate with a missing price would otherwise sail through as
 * "free", sort to the very top of the list, and be offered to the traveller at €0.
 */
function bookablePrice(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * @param {Array<{name?:string, roomCode?:string, board?:string, boardCode?:string,
 *                price?:number, currency?:string, rateKey?:string, supplier?:string}>} rooms
 * @returns {Array<{ key:string, name:string, cheapest:object, boards:Array<object> }>}
 *   Rooms cheapest-first; boards within a room cheapest-first. Each board carries `index`
 *   (its position in the input) and `boardLabel` (what to print).
 */
export function groupRoomsByBoard(rooms) {
  if (!Array.isArray(rooms) || rooms.length === 0) return [];

  const byRoom = new Map();
  rooms.forEach((r, index) => {
    // A rate with no usable price cannot be offered or booked.
    const price = bookablePrice(r?.price);
    if (price == null) return;

    const rk = roomKeyOf(r);
    if (!byRoom.has(rk)) {
      byRoom.set(rk, { key: rk, name: String(r.name || 'Room').trim() || 'Room', boards: new Map() });
    }
    const group = byRoom.get(rk);
    const bk = boardKeyOf(r);
    const prev = group.boards.get(bk);
    // Strictly cheaper wins, so an equal-priced later duplicate never reshuffles the list.
    if (!prev || price < prev.price) {
      group.boards.set(bk, {
        ...r,
        price,
        index,
        boardLabel: String(r.board || r.boardCode || '').trim() || NO_BOARD_LABEL,
      });
    }
  });

  return [...byRoom.values()]
    .map((g) => {
      const boards = [...g.boards.values()].sort((a, b) => a.price - b.price);
      return { key: g.key, name: g.name, boards, cheapest: boards[0] };
    })
    .filter((g) => g.boards.length > 0)
    .sort((a, b) => a.cheapest.price - b.cheapest.price);
}

/** How many distinct boards are on offer across the whole hotel — drives the summary line. */
export function boardCount(groups) {
  const seen = new Set();
  for (const g of groups ?? []) for (const b of g.boards) seen.add(b.boardLabel);
  return seen.size;
}

export default groupRoomsByBoard;
