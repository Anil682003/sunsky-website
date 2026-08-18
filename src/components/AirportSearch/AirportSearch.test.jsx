import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AirportSearch from './AirportSearch';

// The From/To panel of the flight search. It exists because the site shipped two hardcoded
// arrays of eight airports: a traveller could not fly anywhere a developer had not typed out,
// while the dashboard already held 1,306.

const search = vi.fn();
vi.mock('../../api', () => ({ searchAirports: (...a) => search(...a) }));

const SHORTLIST = [
  { code: 'BRU', name: 'Brussels Airport', city: 'Brussels', country: '', flag: '🇧🇪' },
  { code: 'CRL', name: 'Brussels South Charleroi', city: 'Charleroi', country: '', flag: '🇧🇪' },
];
const MALAGA = { code: 'AGP', name: 'Malaga Airport', city: 'Malaga', country: 'Spain', flag: '🇪🇸' };
const MADRID = { code: 'MAD', name: 'Barajas Airport', city: 'Madrid', country: 'Spain', flag: '🇪🇸' };

const setup = (props = {}) => {
  const onPick = vi.fn();
  const onClose = vi.fn();
  render(
    <AirportSearch title="Departing from" fallback={SHORTLIST} fallbackLabel="Popular departure airports"
      onPick={onPick} onClose={onClose} {...props} />
  );
  return { onPick, onClose, input: screen.getByLabelText('Departing from') };
};

beforeEach(() => { search.mockReset(); search.mockResolvedValue([]); });

describe('AirportSearch', () => {
  it('opens on the curated shortlist, before anything is typed', () => {
    setup();
    expect(screen.getByText('Popular departure airports')).toBeInTheDocument();
    expect(screen.getByText('Brussels (BRU)')).toBeInTheDocument();
    expect(search).not.toHaveBeenCalled();
  });

  it('searches the dashboard once there is enough to search on', async () => {
    const user = userEvent.setup();
    search.mockResolvedValue([MALAGA, MADRID]);
    const { input } = setup();

    // One character is not a search — it would return a third of the list.
    await user.type(input, 'm');
    expect(search).not.toHaveBeenCalled();

    await user.type(input, 'a');
    await waitFor(() => expect(screen.getByText('Malaga (AGP)')).toBeInTheDocument());
    expect(screen.getByText('Madrid (MAD)')).toBeInTheDocument();
    // The shortlist steps aside once real results arrive.
    expect(screen.queryByText('Brussels (BRU)')).toBeNull();
  });

  it('hands back the airport that was clicked, and closes', async () => {
    const user = userEvent.setup();
    search.mockResolvedValue([MALAGA]);
    const { onPick, onClose, input } = setup();

    await user.type(input, 'malaga');
    await user.click(await screen.findByText('Malaga (AGP)'));

    expect(onPick).toHaveBeenCalledWith(MALAGA);
    expect(onClose).toHaveBeenCalled();
  });

  it('picks from the shortlist without any search at all', async () => {
    const user = userEvent.setup();
    const { onPick } = setup();
    await user.click(screen.getByText('Brussels (BRU)'));
    expect(onPick).toHaveBeenCalledWith(SHORTLIST[0]);
  });

  it('says so when nothing matches, instead of showing an empty box', async () => {
    const user = userEvent.setup();
    search.mockResolvedValue([]);
    const { input } = setup();
    await user.type(input, 'zzzz');
    expect(await screen.findByText(/no airport matches/i)).toBeInTheDocument();
  });

  // The whole point of the debounce: six keystrokes must not be six requests.
  it('asks once for a word typed in one go', async () => {
    const user = userEvent.setup();
    search.mockResolvedValue([MALAGA]);
    const { input } = setup();
    await user.type(input, 'malaga');
    await waitFor(() => expect(screen.getByText('Malaga (AGP)')).toBeInTheDocument());
    expect(search).toHaveBeenCalledTimes(1);
    expect(search.mock.calls[0][0]).toBe('malaga');
  });

  // A slow answer to "mal" must not be listed under "madrid" — results carry their own term.
  it('never shows an answer to a term that is no longer typed', async () => {
    const user = userEvent.setup();
    search.mockResolvedValue([MALAGA]);
    const { input } = setup();
    await user.type(input, 'malaga');
    await waitFor(() => expect(screen.getByText('Malaga (AGP)')).toBeInTheDocument());

    search.mockImplementation(() => new Promise(() => {}));   // next answer never arrives
    await user.type(input, 'x');
    await waitFor(() => expect(screen.getByText('Searching…')).toBeInTheDocument());
    expect(screen.queryByText('Malaga (AGP)')).toBeNull();
  });

  it('goes back to the shortlist when the box is emptied', async () => {
    const user = userEvent.setup();
    search.mockResolvedValue([MALAGA]);
    const { input } = setup();
    await user.type(input, 'malaga');
    await waitFor(() => expect(screen.getByText('Malaga (AGP)')).toBeInTheDocument());

    await user.click(screen.getByLabelText('Clear'));
    expect(screen.getByText('Brussels (BRU)')).toBeInTheDocument();
    expect(screen.queryByText('Malaga (AGP)')).toBeNull();
  });

  it('can be driven from the keyboard', async () => {
    const user = userEvent.setup();
    search.mockResolvedValue([MALAGA, MADRID]);
    const { onPick, onClose, input } = setup();

    await user.type(input, 'ma');
    await waitFor(() => expect(screen.getByText('Malaga (AGP)')).toBeInTheDocument());
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onPick).toHaveBeenCalledWith(MADRID);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the airport and country under the place, so two Brussels airports are told apart', async () => {
    setup();
    expect(screen.getByText('Brussels Airport')).toBeInTheDocument();
    expect(screen.getByText('Brussels South Charleroi')).toBeInTheDocument();
  });
});
