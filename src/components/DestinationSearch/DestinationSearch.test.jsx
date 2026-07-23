import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DestinationSearch from './DestinationSearch';

// The header typeahead. Its contract with the admin content API is
//   { destinations: [{code,name,country}],
//     hotels:       [{hotelCode,name,destinationCode,destinationName,country,stars,image}] }
// where `image` is the hotel's master photo as a thumbnail, or null.

const searchSpy = vi.fn();
vi.mock('../../api/filters', () => ({
  searchDestinationsAndHotels: (...args) => searchSpy(...args),
}));

const HOTEL = {
  hotelCode: '32243', name: 'Rixos Premium Belek', destinationCode: 'AYT',
  destinationName: 'Antalya', country: 'Turkey', stars: 5,
  image: 'https://photos.hotelbeds.com/giata/small/00/032243/032243a_hb_a_001.jpg',
};
const HOTEL_NO_IMAGE = { ...HOTEL, hotelCode: '99', name: 'Rixos Unphotographed', image: null };
const DEST = { code: 'AYT', name: 'Antalya', country: 'Turkey' };

const answer = (data) => { searchSpy.mockResolvedValue(data); };

beforeEach(() => {
  searchSpy.mockReset();
  answer({ destinations: [DEST], hotels: [HOTEL] });
});

const type = async (text, props = {}) => {
  const user = userEvent.setup();
  const onSelect = props.onSelect ?? vi.fn();
  render(<DestinationSearch {...props} onSelect={onSelect} />);
  await user.type(screen.getByRole('textbox'), text);
  return { user, onSelect };
};

const hotelRow = (name) => screen.getByText(name).closest('button');

describe('master image thumbnail', () => {
  it("shows the hotel's master image in the row, not the generic icon", async () => {
    await type('rixos');
    await waitFor(() => expect(screen.getByText('Rixos Premium Belek')).toBeInTheDocument());

    const img = within(hotelRow('Rixos Premium Belek')).getByRole('presentation', { hidden: true });
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute('src', HOTEL.image);
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('falls back to the icon for a hotel with no photo', async () => {
    // ~8% of active hotels have no image at all; a missing photo must not leave a broken frame.
    answer({ destinations: [], hotels: [HOTEL_NO_IMAGE] });
    await type('rixos');
    await waitFor(() => expect(screen.getByText('Rixos Unphotographed')).toBeInTheDocument());

    const row = hotelRow('Rixos Unphotographed');
    expect(within(row).queryByRole('img', { hidden: true })).not.toBeInTheDocument();
    expect(row.querySelector('svg')).toBeTruthy();
  });

  it('falls back to the icon when the image URL fails to load', async () => {
    await type('rixos');
    await waitFor(() => expect(screen.getByText('Rixos Premium Belek')).toBeInTheDocument());

    const row = hotelRow('Rixos Premium Belek');
    const img = within(row).getByRole('presentation', { hidden: true });
    // A dead CDN URL fires onError; the row must degrade, not show a broken image.
    img.dispatchEvent(new Event('error'));
    await waitFor(() =>
      expect(within(hotelRow('Rixos Premium Belek')).queryByRole('presentation', { hidden: true }))
        .not.toBeInTheDocument());
    expect(hotelRow('Rixos Premium Belek').querySelector('svg')).toBeTruthy();
  });

  it('never renders a thumbnail for a destination row', async () => {
    answer({ destinations: [DEST], hotels: [] });
    await type('antal');
    await waitFor(() => expect(screen.getByText('Antalya')).toBeInTheDocument());
    expect(hotelRow('Antalya').querySelector('img')).toBeNull();
  });
});

describe('selection', () => {
  it('passes the hotel identity, including its image, to onSelect', async () => {
    const { user, onSelect } = await type('rixos');
    await waitFor(() => expect(screen.getByText('Rixos Premium Belek')).toBeInTheDocument());
    await user.click(hotelRow('Rixos Premium Belek'));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({
      type: 'hotel', hotelCode: '32243', destinationCode: 'AYT', image: HOTEL.image,
    }));
  });

  it('passes a destination as a destination, not a hotel', async () => {
    answer({ destinations: [DEST], hotels: [] });
    const { user, onSelect } = await type('antal');
    await waitFor(() => expect(screen.getByText('Antalya')).toBeInTheDocument());
    await user.click(hotelRow('Antalya'));

    expect(onSelect).toHaveBeenCalledWith({ type: 'destination', code: 'AYT', name: 'Antalya', country: 'Turkey' });
  });

  it('trims stray whitespace from a source name', async () => {
    answer({ destinations: [], hotels: [{ ...HOTEL, name: '  Ana y Jose Hotel  ' }] });
    const { user, onSelect } = await type('ana');
    await waitFor(() => expect(screen.getByText('Ana y Jose Hotel')).toBeInTheDocument());
    await user.click(hotelRow('Ana y Jose Hotel'));
    expect(onSelect.mock.calls[0][0].name).toBe('Ana y Jose Hotel');
  });

  it('clearing tells the caller the selection is gone', async () => {
    const { user, onSelect } = await type('rixos');
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});

describe('keyboard navigation', () => {
  it('walks hotels then destinations, in the order they are rendered', async () => {
    const { user, onSelect } = await type('a');   // 1 char: below the 2-char floor, no request
    await user.keyboard('n');                     // "an" — now it searches
    await waitFor(() => expect(screen.getByText('Rixos Premium Belek')).toBeInTheDocument());

    await user.keyboard('{ArrowDown}');           // first hotel
    await user.keyboard('{ArrowDown}');           // first destination
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ type: 'destination', code: 'AYT' }));
  });

  it('Escape closes the dropdown without selecting', async () => {
    const { user, onSelect } = await type('rixos');
    await waitFor(() => expect(screen.getByText('Rixos Premium Belek')).toBeInTheDocument());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByText('Rixos Premium Belek')).not.toBeInTheDocument());
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('request behaviour', () => {
  it('does not search below two characters', async () => {
    await type('r');
    await new Promise((r) => setTimeout(r, 400));
    expect(searchSpy).not.toHaveBeenCalled();
  });

  it('debounces a burst of keystrokes into one request', async () => {
    await type('rixos');
    await waitFor(() => expect(searchSpy).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 400));
    expect(searchSpy).toHaveBeenCalledTimes(1);
  });

  it('passes an AbortSignal so a superseded keystroke is cancelled, not just ignored', async () => {
    await type('rixos');
    await waitFor(() => expect(searchSpy).toHaveBeenCalled());
    expect(searchSpy.mock.calls[0][2]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('serves a repeated query from cache instead of re-requesting', async () => {
    const { user } = await type('rixos');
    await waitFor(() => expect(screen.getByText('Rixos Premium Belek')).toBeInTheDocument());
    expect(searchSpy).toHaveBeenCalledTimes(1);

    await user.keyboard('{Backspace}');                    // "rixo" — a new query, so a request
    await waitFor(() => expect(searchSpy).toHaveBeenCalledTimes(2));
    await user.keyboard('s');                              // back to "rixos" — already known
    await waitFor(() => expect(screen.getByText('Rixos Premium Belek')).toBeInTheDocument());
    await new Promise((r) => setTimeout(r, 400));
    expect(searchSpy).toHaveBeenCalledTimes(2);
  });

  it('reports when nothing matches', async () => {
    answer({ destinations: [], hotels: [] });
    await type('zzzz');
    await waitFor(() => expect(screen.getByText(/No hotels or destinations match/)).toBeInTheDocument());
  });

  it('an empty result is not cached, so the query is retried', async () => {
    // An empty payload is what an aborted request also produces — caching it would wedge a
    // perfectly good query into looking like it has no matches.
    answer({ destinations: [], hotels: [] });
    const { user } = await type('rixos');
    await waitFor(() => expect(searchSpy).toHaveBeenCalledTimes(1));

    answer({ destinations: [], hotels: [HOTEL] });
    await user.keyboard('{Backspace}');
    await waitFor(() => expect(searchSpy).toHaveBeenCalledTimes(2));
    await user.keyboard('s');
    await waitFor(() => expect(searchSpy).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.getByText('Rixos Premium Belek')).toBeInTheDocument());
  });
});
