import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DestinationSearch from './DestinationSearch';

// The HEADER search — the one that finds HOTELS and DESTINATIONS by name.
// (The Hero's "Package / Hotel only" search is a separate component with its own
// country+destination cascade and is deliberately not exercised here.)
//
// Contract with the admin content API:
//   { destinations: [{ code, name, country }],
//     hotels:       [{ hotelCode, name, destinationCode, destinationName, zoneName, country, stars, image }] }
// `image` is the hotel's master photo as a thumbnail URL, or null.
// `zoneName` is the resort area inside the city ("Belek" in Antalya), or null.

const searchSpy = vi.fn();
vi.mock('../../api/filters', () => ({
  searchDestinationsAndHotels: (...args) => searchSpy(...args),
}));

const IMG = 'https://photos.hotelbeds.com/giata/small/00/032243/032243a_hb_a_001.jpg';
const HOTEL = {
  hotelCode: '32243', name: 'Rixos Premium Belek', destinationCode: 'AYT',
  destinationName: 'Antalya', zoneName: 'Belek', country: 'Turkey', stars: 5, image: IMG,
};
const HOTEL_2 = {
  hotelCode: '55555', name: 'Rixos Downtown', destinationCode: 'AYT',
  destinationName: 'Antalya', zoneName: 'Lara', country: 'Turkey', stars: 4,
  image: 'https://photos.hotelbeds.com/giata/small/00/055555/a.jpg',
};
const HOTEL_NO_IMAGE = { ...HOTEL, hotelCode: '99', name: 'Rixos Unphotographed', image: null };
const DEST = { code: 'AYT', name: 'Antalya', country: 'Turkey' };
const DEST_2 = { code: 'BJV', name: 'Bodrum', country: 'Turkey' };

const RECENTS_KEY = 'sunsky.recentSearches';
const answer = (data) => { searchSpy.mockResolvedValue(data); };
const seedRecents = (list) => localStorage.setItem(RECENTS_KEY, JSON.stringify(list));
const storedRecents = () => JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]');

beforeEach(() => {
  localStorage.clear();
  searchSpy.mockReset();
  answer({ destinations: [DEST], hotels: [HOTEL] });
});

const setup = (props = {}) => {
  const user = userEvent.setup();
  const onSelect = props.onSelect ?? vi.fn();
  const onGo = props.onGo ?? vi.fn();
  const utils = render(<DestinationSearch {...props} onSelect={onSelect} onGo={onGo} />);
  return { user, onSelect, onGo, ...utils };
};

const type = async (text, props = {}) => {
  const ctx = setup(props);
  await ctx.user.type(screen.getByRole('textbox'), text);
  return ctx;
};

// Result/recent rows are buttons; find the one carrying a given name.
const row = (name) => screen.getByText(name).closest('button');
const thumbIn = (el) => within(el).queryByRole('presentation', { hidden: true });
const settle = () => new Promise((r) => setTimeout(r, 400));

// ── HOTEL IMAGES ─────────────────────────────────────────────────────────────

describe('hotel images in the matching list', () => {
  it("renders the hotel's master image in place of the generic icon", async () => {
    await type('rixos');
    await waitFor(() => expect(screen.getByText('Rixos Premium Belek')).toBeInTheDocument());

    const img = thumbIn(row('Rixos Premium Belek'));
    expect(img).not.toBeNull();
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute('src', IMG);
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('decoding', 'async');
    // Decorative: the row's text already names the hotel, so it must not be announced twice.
    expect(img).toHaveAttribute('alt', '');
  });

  it('keeps the icon for a hotel that has no photo', async () => {
    // ~8% of active hotels carry no image at all; that must not leave a broken frame.
    answer({ destinations: [], hotels: [HOTEL_NO_IMAGE] });
    await type('rixos');
    await waitFor(() => expect(screen.getByText('Rixos Unphotographed')).toBeInTheDocument());

    const el = row('Rixos Unphotographed');
    expect(thumbIn(el)).toBeNull();
    expect(el.querySelector('svg')).toBeTruthy();
  });

  it('falls back to the icon when the image URL fails to load', async () => {
    await type('rixos');
    await waitFor(() => expect(screen.getByText('Rixos Premium Belek')).toBeInTheDocument());

    thumbIn(row('Rixos Premium Belek')).dispatchEvent(new Event('error'));
    await waitFor(() => expect(thumbIn(row('Rixos Premium Belek'))).toBeNull());
    expect(row('Rixos Premium Belek').querySelector('svg')).toBeTruthy();
  });

  it('a broken image on one hotel does not blank the others', async () => {
    answer({ destinations: [], hotels: [HOTEL, HOTEL_2] });
    await type('rixos');
    await waitFor(() => expect(screen.getByText('Rixos Downtown')).toBeInTheDocument());

    thumbIn(row('Rixos Premium Belek')).dispatchEvent(new Event('error'));
    await waitFor(() => expect(thumbIn(row('Rixos Premium Belek'))).toBeNull());
    expect(thumbIn(row('Rixos Downtown'))).not.toBeNull();
  });

  it('shows no thumbnail on a destination row', async () => {
    answer({ destinations: [DEST], hotels: [] });
    await type('antal');
    await waitFor(() => expect(screen.getByText('Antalya')).toBeInTheDocument());
    expect(row('Antalya').querySelector('img')).toBeNull();
  });

  it('shows the name, stars and place next to the image', async () => {
    await type('rixos');
    await waitFor(() => expect(screen.getByText('Rixos Premium Belek')).toBeInTheDocument());
    const el = row('Rixos Premium Belek');
    // Zone first: the resort area is what travellers search by ("is it in Belek or in Lara?").
    expect(within(el).getByText('Belek, Antalya, Turkey')).toBeInTheDocument();
    expect(within(el).getByLabelText('5 star')).toBeInTheDocument();
  });

  it('falls back to city + country for a hotel that sits in no zone', async () => {
    answer({ destinations: [], hotels: [{ ...HOTEL, zoneName: null }] });
    await type('rixos');
    await waitFor(() => expect(screen.getByText('Rixos Premium Belek')).toBeInTheDocument());
    expect(within(row('Rixos Premium Belek')).getByText('Antalya, Turkey')).toBeInTheDocument();
  });

  it('does not print the place twice when the zone repeats the city', async () => {
    // Real data: hotels in Antalya's city-centre zone come back as zone "Antalya".
    answer({ destinations: [], hotels: [{ ...HOTEL, zoneName: 'antalya' }] });
    await type('rixos');
    await waitFor(() => expect(screen.getByText('Rixos Premium Belek')).toBeInTheDocument());
    expect(within(row('Rixos Premium Belek')).getByText('antalya, Turkey')).toBeInTheDocument();
  });

  it('omits stars entirely rather than inventing a rating', async () => {
    answer({ destinations: [], hotels: [{ ...HOTEL, stars: null }] });
    await type('rixos');
    await waitFor(() => expect(screen.getByText('Rixos Premium Belek')).toBeInTheDocument());
    expect(within(row('Rixos Premium Belek')).queryByLabelText(/star/)).not.toBeInTheDocument();
  });

  it('drops the place line to just the destination when country is missing', async () => {
    answer({ destinations: [], hotels: [{ ...HOTEL, zoneName: null, country: null }] });
    await type('rixos');
    await waitFor(() => expect(screen.getByText('Rixos Premium Belek')).toBeInTheDocument());
    expect(within(row('Rixos Premium Belek')).getByText('Antalya')).toBeInTheDocument();
  });
});

// ── SELECTION ────────────────────────────────────────────────────────────────

describe('picking a result', () => {
  it('hands the hotel back with its full identity', async () => {
    const { user, onSelect } = await type('rixos');
    await waitFor(() => expect(screen.getByText('Rixos Premium Belek')).toBeInTheDocument());
    await user.click(row('Rixos Premium Belek'));

    expect(onSelect).toHaveBeenCalledWith({
      type: 'hotel', hotelCode: '32243', name: 'Rixos Premium Belek',
      destinationCode: 'AYT', destinationName: 'Antalya', zoneName: 'Belek', country: 'Turkey',
      stars: 5, image: IMG,
    });
  });

  it('hands a destination back as a destination, not a hotel', async () => {
    answer({ destinations: [DEST], hotels: [] });
    const { user, onSelect } = await type('antal');
    await waitFor(() => expect(screen.getByText('Antalya')).toBeInTheDocument());
    await user.click(row('Antalya'));

    expect(onSelect).toHaveBeenCalledWith({ type: 'destination', code: 'AYT', name: 'Antalya', country: 'Turkey' });
  });

  it('trims stray whitespace from a source name', async () => {
    answer({ destinations: [], hotels: [{ ...HOTEL, name: '  Ana y Jose Hotel  ' }] });
    const { user, onSelect } = await type('ana');
    await waitFor(() => expect(screen.getByText('Ana y Jose Hotel')).toBeInTheDocument());
    await user.click(row('Ana y Jose Hotel'));
    expect(onSelect.mock.calls[0][0].name).toBe('Ana y Jose Hotel');
  });

  it('closes the dropdown and puts the pick in the field', async () => {
    const { user } = await type('rixos');
    await waitFor(() => expect(screen.getByText('Rixos Premium Belek')).toBeInTheDocument());
    await user.click(row('Rixos Premium Belek'));

    expect(screen.getByRole('textbox')).toHaveValue('Rixos Premium Belek');
    await waitFor(() => expect(screen.queryByText('Belek, Antalya, Turkey')).not.toBeInTheDocument());
  });

  it('clearing empties the field and tells the caller the selection is gone', async () => {
    const { user, onSelect } = await type('rixos');
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onSelect).toHaveBeenCalledWith(null);
    expect(screen.getByRole('textbox')).toHaveValue('');
  });
});

// ── SEARCH REQUEST BEHAVIOUR ─────────────────────────────────────────────────

describe('searching', () => {
  it('does not search below two characters', async () => {
    await type('r');
    await settle();
    expect(searchSpy).not.toHaveBeenCalled();
  });

  it('ignores whitespace-only input', async () => {
    await type('   ');
    await settle();
    expect(searchSpy).not.toHaveBeenCalled();
  });

  it('debounces a burst of keystrokes into one request', async () => {
    await type('rixos');
    await waitFor(() => expect(searchSpy).toHaveBeenCalled());
    await settle();
    expect(searchSpy).toHaveBeenCalledTimes(1);
  });

  it('applies only the latest response when an earlier one lands late', async () => {
    // The reqRef guard: a slow "ri" answer must not overwrite the "rixos" list.
    let resolveSlow;
    searchSpy.mockImplementationOnce(() => new Promise((r) => { resolveSlow = r; }));
    searchSpy.mockResolvedValue({ destinations: [], hotels: [HOTEL_2] });

    const { user } = await type('ri');
    await waitFor(() => expect(searchSpy).toHaveBeenCalledTimes(1));
    await user.type(screen.getByRole('textbox'), 'xos');
    await waitFor(() => expect(screen.getByText('Rixos Downtown')).toBeInTheDocument());

    resolveSlow({ destinations: [], hotels: [HOTEL] });      // the stale answer arrives now
    await settle();
    expect(screen.getByText('Rixos Downtown')).toBeInTheDocument();
    expect(screen.queryByText('Rixos Premium Belek')).not.toBeInTheDocument();
  });

  it('reports when nothing matches, quoting what was typed', async () => {
    answer({ destinations: [], hotels: [] });
    await type('zzzz');
    await waitFor(() =>
      expect(screen.getByText(/No hotels or destinations match “zzzz”/)).toBeInTheDocument());
  });

  it('survives an API failure without crashing the box', async () => {
    // filters.js swallows errors into an empty result; the box must render the empty state.
    searchSpy.mockResolvedValue({ destinations: [], hotels: [] });
    await type('rixos');
    await waitFor(() => expect(screen.getByText(/No hotels or destinations match/)).toBeInTheDocument());
  });

  it('tolerates a malformed payload with fields missing', async () => {
    searchSpy.mockResolvedValue({});
    await type('rixos');
    await waitFor(() => expect(screen.getByText(/No hotels or destinations match/)).toBeInTheDocument());
  });

  it('counts places and hotels in the tally strip', async () => {
    answer({ destinations: [DEST, DEST_2], hotels: [HOTEL] });
    await type('an');
    await waitFor(() => expect(screen.getByText('2 places · 1 hotel')).toBeInTheDocument());
  });

  it('singularises the tally for a lone place', async () => {
    answer({ destinations: [DEST], hotels: [] });
    await type('an');
    await waitFor(() => expect(screen.getByText('1 place')).toBeInTheDocument());
  });
});

// ── KEYBOARD ─────────────────────────────────────────────────────────────────

describe('keyboard navigation', () => {
  it('walks destinations first, then hotels — the order they are rendered', async () => {
    answer({ destinations: [DEST], hotels: [HOTEL] });
    const { user, onSelect } = await type('an');
    await waitFor(() => expect(screen.getByText('Rixos Premium Belek')).toBeInTheDocument());

    await user.keyboard('{ArrowDown}');       // destination
    await user.keyboard('{ArrowDown}');       // hotel
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ type: 'hotel', hotelCode: '32243' }));
  });

  it('ArrowUp walks back and Enter takes the highlighted row', async () => {
    answer({ destinations: [DEST], hotels: [HOTEL] });
    const { user, onSelect } = await type('an');
    await waitFor(() => expect(screen.getByText('Rixos Premium Belek')).toBeInTheDocument());

    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}{Enter}');
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ type: 'destination', code: 'AYT' }));
  });

  it('cannot walk past the last row', async () => {
    answer({ destinations: [], hotels: [HOTEL] });
    const { user, onSelect } = await type('rixos');
    await waitFor(() => expect(screen.getByText('Rixos Premium Belek')).toBeInTheDocument());

    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{Enter}');
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ hotelCode: '32243' }));
  });

  it('Enter with nothing highlighted selects nothing', async () => {
    const { user, onSelect } = await type('rixos');
    await waitFor(() => expect(screen.getByText('Rixos Premium Belek')).toBeInTheDocument());
    await user.keyboard('{Enter}');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('Escape closes without selecting, and does not resume on a stale row', async () => {
    answer({ destinations: [], hotels: [HOTEL] });   // one row, so "first row" is unambiguous
    const { user, onSelect } = await type('rixos');
    await waitFor(() => expect(screen.getByText('Rixos Premium Belek')).toBeInTheDocument());

    await user.keyboard('{ArrowDown}{Escape}');
    await waitFor(() => expect(screen.queryByText('Rixos Premium Belek')).not.toBeInTheDocument());
    expect(onSelect).not.toHaveBeenCalled();

    // Reopening starts from no highlight, so one ArrowDown lands on the FIRST row again.
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ hotelCode: '32243' }));
  });

  it('closes on an outside click', async () => {
    const { user } = await type('rixos');
    await waitFor(() => expect(screen.getByText('Rixos Premium Belek')).toBeInTheDocument());
    await user.click(document.body);
    await waitFor(() => expect(screen.queryByText('Rixos Premium Belek')).not.toBeInTheDocument());
  });
});

// ── RECENT SEARCHES ──────────────────────────────────────────────────────────

describe('recent searches', () => {
  it('remembers a picked hotel, with its image', async () => {
    const { user } = await type('rixos');
    await waitFor(() => expect(screen.getByText('Rixos Premium Belek')).toBeInTheDocument());
    await user.click(row('Rixos Premium Belek'));

    const saved = storedRecents();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ kind: 'hotel', hotelCode: '32243', zoneName: 'Belek', image: IMG });
  });

  it('shows a remembered hotel with the same zone line the result row had', async () => {
    seedRecents([{ kind: 'hotel', hotelCode: '32243', name: 'Rixos Premium Belek', destinationName: 'Antalya', zoneName: 'Belek', country: 'Turkey', image: IMG }]);
    const { user } = setup();
    await user.click(screen.getByRole('textbox'));

    await waitFor(() => expect(screen.getByText('Recent searches')).toBeInTheDocument());
    expect(within(row('Rixos Premium Belek')).getByText('Belek, Antalya, Turkey')).toBeInTheDocument();
  });

  it('shows a remembered hotel with its photo, not a generic icon', async () => {
    seedRecents([{ kind: 'hotel', hotelCode: '32243', name: 'Rixos Premium Belek', destinationName: 'Antalya', country: 'Turkey', image: IMG }]);
    const { user } = setup();
    await user.click(screen.getByRole('textbox'));

    await waitFor(() => expect(screen.getByText('Recent searches')).toBeInTheDocument());
    expect(thumbIn(row('Rixos Premium Belek'))).toHaveAttribute('src', IMG);
  });

  it('falls back to the icon for a remembered hotel with no photo', async () => {
    seedRecents([{ kind: 'hotel', hotelCode: '99', name: 'Rixos Unphotographed', image: null }]);
    const { user } = setup();
    await user.click(screen.getByRole('textbox'));

    await waitFor(() => expect(screen.getByText('Recent searches')).toBeInTheDocument());
    expect(thumbIn(row('Rixos Unphotographed'))).toBeNull();
  });

  it('re-selects a remembered hotel without searching again', async () => {
    seedRecents([{ kind: 'hotel', hotelCode: '32243', name: 'Rixos Premium Belek', destinationCode: 'AYT', image: IMG }]);
    const { user, onSelect } = setup();
    await user.click(screen.getByRole('textbox'));
    await waitFor(() => expect(screen.getByText('Recent searches')).toBeInTheDocument());

    await user.click(row('Rixos Premium Belek'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ type: 'hotel', hotelCode: '32243' }));
    expect(searchSpy).not.toHaveBeenCalled();
  });

  it('keeps only the four most recent, newest first', async () => {
    seedRecents([
      { kind: 'destination', code: 'A', name: 'Alpha' },
      { kind: 'destination', code: 'B', name: 'Bravo' },
      { kind: 'destination', code: 'C', name: 'Charlie' },
      { kind: 'destination', code: 'D', name: 'Delta' },
    ]);
    const { user } = await type('rixos');
    await waitFor(() => expect(screen.getByText('Rixos Premium Belek')).toBeInTheDocument());
    await user.click(row('Rixos Premium Belek'));

    const saved = storedRecents();
    expect(saved).toHaveLength(4);
    expect(saved[0].hotelCode).toBe('32243');
    expect(saved.map((r) => r.name)).not.toContain('Delta');   // oldest dropped
  });

  it('re-picking a hotel moves it to the top instead of duplicating it', async () => {
    seedRecents([
      { kind: 'hotel', hotelCode: '32243', name: 'Rixos Premium Belek', image: IMG },
      { kind: 'destination', code: 'BJV', name: 'Bodrum' },
    ]);
    const { user } = await type('rixos');
    await waitFor(() => expect(screen.getAllByText('Rixos Premium Belek').length).toBeGreaterThan(0));
    await user.click(row('Rixos Premium Belek'));

    const saved = storedRecents();
    expect(saved).toHaveLength(2);
    expect(saved[0].hotelCode).toBe('32243');
  });

  it('a hotel and a destination of the SAME name are kept apart', async () => {
    // De-dupe is on kind+identity, not name — "Antalya" the city and a hotel called
    // "Antalya" are different picks and must not evict each other.
    seedRecents([{ kind: 'destination', code: 'AYT', name: 'Antalya' }]);
    answer({ destinations: [], hotels: [{ ...HOTEL, name: 'Antalya' }] });
    const { user } = await type('antal');
    await waitFor(() => expect(screen.getAllByText('Antalya').length).toBeGreaterThan(0));
    await user.click(screen.getAllByText('Antalya').find((e) => e.closest('button'))?.closest('button'));

    expect(storedRecents()).toHaveLength(2);
  });

  it('drops a stored entry that lost the code it navigates by', async () => {
    // Without this guard the row would navigate to /results?hotelCode=undefined.
    seedRecents([
      { kind: 'hotel', name: 'No Code Hotel' },              // missing hotelCode
      { kind: 'destination', name: 'No Code Place' },        // missing code
      { kind: 'hotel', hotelCode: '32243', name: 'Good Hotel' },
    ]);
    const { user } = setup();
    await user.click(screen.getByRole('textbox'));
    await waitFor(() => expect(screen.getByText('Recent searches')).toBeInTheDocument());

    expect(screen.getByText('Good Hotel')).toBeInTheDocument();
    expect(screen.queryByText('No Code Hotel')).not.toBeInTheDocument();
    expect(screen.queryByText('No Code Place')).not.toBeInTheDocument();
  });

  it('ignores unparseable storage instead of throwing', async () => {
    localStorage.setItem(RECENTS_KEY, 'not json{{{');
    const { user } = setup({ suggestions: [{ label: 'Antalya', url: '/results?destinations=AYT' }] });
    await user.click(screen.getByRole('textbox'));
    await waitFor(() => expect(screen.getByText('Popular right now')).toBeInTheDocument());
    expect(screen.queryByText('Recent searches')).not.toBeInTheDocument();
  });

  it('ignores storage holding the wrong shape entirely', async () => {
    localStorage.setItem(RECENTS_KEY, JSON.stringify({ nope: true }));
    const { user } = setup();
    await user.click(screen.getByRole('textbox'));
    expect(screen.queryByText('Recent searches')).not.toBeInTheDocument();
  });

  it('still updates the on-screen list when storage refuses the write', async () => {
    // Safari private mode throws on setItem; the pick must still work.
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const { user, onSelect } = await type('rixos');
    await waitFor(() => expect(screen.getByText('Rixos Premium Belek')).toBeInTheDocument());
    await user.click(row('Rixos Premium Belek'));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ hotelCode: '32243' }));
    setItem.mockRestore();
  });
});

// ── IDLE PANEL ───────────────────────────────────────────────────────────────

describe('idle panel', () => {
  const SUGGESTIONS = [
    { label: 'Antalya', url: '/results?destinations=AYT' },
    { label: 'Spain', url: '/results?countries=ES' },
  ];

  it('offers popular destinations before anything is typed', async () => {
    const { user } = setup({ suggestions: SUGGESTIONS });
    await user.click(screen.getByRole('textbox'));
    await waitFor(() => expect(screen.getByText('Popular right now')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Antalya' })).toBeInTheDocument();
  });

  it('a suggestion chip navigates by its prebuilt URL', async () => {
    // Chips carry a URL because a whole country and a single city need different params.
    const { user, onGo } = setup({ suggestions: SUGGESTIONS });
    await user.click(screen.getByRole('textbox'));
    await user.click(screen.getByRole('button', { name: 'Spain' }));
    expect(onGo).toHaveBeenCalledWith('/results?countries=ES');
  });

  it('gives way to results as soon as a query is typed', async () => {
    const { user } = setup({ suggestions: SUGGESTIONS });
    await user.type(screen.getByRole('textbox'), 'rixos');
    await waitFor(() => expect(screen.getByText('Rixos Premium Belek')).toBeInTheDocument());
    expect(screen.queryByText('Popular right now')).not.toBeInTheDocument();
  });

  it('stays shut when there is nothing to offer', async () => {
    const { user } = setup({ suggestions: [] });
    await user.click(screen.getByRole('textbox'));
    expect(screen.queryByText('Popular right now')).not.toBeInTheDocument();
    expect(screen.queryByText('Recent searches')).not.toBeInTheDocument();
  });

  it('offers "browse all" only when the caller supplies a handler', async () => {
    const onBrowseAll = vi.fn();
    const { user } = await type('rixos', { onBrowseAll });
    await waitFor(() => expect(screen.getByText('Rixos Premium Belek')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /browse all destinations/i }));
    expect(onBrowseAll).toHaveBeenCalled();
  });

  it('omits "browse all" when it has no handler', async () => {
    await type('rixos');
    await waitFor(() => expect(screen.getByText('Rixos Premium Belek')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /browse all destinations/i })).not.toBeInTheDocument();
  });
});
