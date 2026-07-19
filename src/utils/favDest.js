// Remembers which HotelBeds destination code a favourited hotel belongs to, so the
// Favourites screen can re-open the hotel with a working live-price search.
//
// The favourite record on the server intentionally stores only what the card needs
// (name, label, stars, image) — not a search snapshot — and the hotel content API
// doesn't expose the destination code. We capture it on the client at the moment of
// favouriting (Results / HotelDetail both know the code) and recall it on open.
// Missing code → the hotel still opens, just without the live calendar (graceful).
const KEY = 'sunsky:favDestCodes';

const read = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); }
  catch { return {}; }
};

export const rememberDestCode = (hotelCode, destinationCode) => {
  if (!hotelCode || !destinationCode) return;
  try {
    const map = read();
    map[String(hotelCode)] = String(destinationCode);
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch { /* storage unavailable — feature just degrades */ }
};

export const recallDestCode = (hotelCode) => read()[String(hotelCode)] || '';
