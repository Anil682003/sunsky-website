import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import AirlineMark from './AirlineMark';
import { __resetAirlineLogos } from '../../utils/airlineLogos';
import axiosInstance from '../../services/axiosInstance';

vi.mock('../../services/axiosInstance', () => ({
  default: { get: vi.fn() },
}));

const directory = (rows) => { axiosInstance.get.mockResolvedValue({ data: { data: rows } }); };

describe('AirlineMark', () => {
  beforeEach(() => {
    __resetAirlineLogos();
    vi.clearAllMocks();
  });

  it('renders the uploaded logo when the dashboard has one', async () => {
    directory([{ iataCode: 'TK', name: 'Turkish Airlines', logo: 'https://cdn.test/tk.png' }]);
    render(<AirlineMark code="TK" className="mark" />);
    const img = await screen.findByRole('img');
    expect(img.getAttribute('src')).toBe('https://cdn.test/tk.png');
    // The host's class survives, because each page sizes this slot from its own stylesheet.
    expect(img.className).toContain('mark');
  });

  it('matches the code case-insensitively and ignores stray whitespace', async () => {
    directory([{ iataCode: 'TK', name: 'Turkish Airlines', logo: 'https://cdn.test/tk.png' }]);
    render(<AirlineMark code=" tk " className="mark" />);
    const img = await screen.findByRole('img');
    expect(img.getAttribute('src')).toBe('https://cdn.test/tk.png');
  });

  it('falls back to the initial when the airline has no logo yet', async () => {
    // The row still exists and still carries the name — that is what the initial comes from.
    directory([{ iataCode: 'VF', name: 'Vietjet Air', logo: null }]);
    const { container } = render(<AirlineMark code="VF" className="mark" />);
    await waitFor(() => expect(container.querySelector('.mark')).toHaveTextContent('V'));
    expect(container.querySelector('img')).toBeNull();
  });

  it('falls back to the initial when a stored logo fails to load', async () => {
    // Exactly what happened to all 170 logos once: the row pointed at a file that was gone.
    directory([{ iataCode: 'TK', name: 'Turkish Airlines', logo: 'https://cdn.test/gone.png' }]);
    const { container } = render(<AirlineMark code="TK" className="mark" />);
    const img = await screen.findByRole('img');
    await act(async () => { img.dispatchEvent(new Event('error')); });
    await waitFor(() => expect(container.querySelector('img')).toBeNull());
    expect(container.querySelector('.mark')).toHaveTextContent('T');
  });

  // A logo is a wordmark, so it already says the name in the airline's own type. Printing the
  // name beside it said everything twice; dropping the name outright would leave a bare "T"
  // whenever there is no logo. The two are decided together.
  it('does not print the name beside a logo that already says it', async () => {
    directory([{ iataCode: 'TK', name: 'Turkish Airlines', logo: 'https://cdn.test/tk.png' }]);
    const { container } = render(<AirlineMark code="TK" className="mark" nameClassName="nm" />);
    await screen.findByRole('img');
    expect(container.querySelector('.nm')).toBeNull();
    expect(container.textContent).not.toContain('Turkish Airlines');
  });

  it('prints the name when there is no logo, so a lone initial is never the whole answer', async () => {
    directory([{ iataCode: 'UR', name: 'Uganda Airlines', logo: null }]);
    const { container } = render(<AirlineMark code="UR" className="mark" nameClassName="nm" />);
    await waitFor(() => expect(container.querySelector('.nm')).toHaveTextContent('Uganda Airlines'));
    expect(container.querySelector('.mark')).toHaveTextContent('U');
  });

  it('brings the name back when a stored logo fails to load', async () => {
    directory([{ iataCode: 'TK', name: 'Turkish Airlines', logo: 'https://cdn.test/gone.png' }]);
    const { container } = render(<AirlineMark code="TK" className="mark" nameClassName="nm" />);
    const img = await screen.findByRole('img');
    await act(async () => { img.dispatchEvent(new Event('error')); });
    await waitFor(() => expect(container.querySelector('.nm')).toHaveTextContent('Turkish Airlines'));
  });

  it('names the airline for a screen reader, which cannot read a wordmark', async () => {
    directory([{ iataCode: 'TK', name: 'Turkish Airlines', logo: 'https://cdn.test/tk.png' }]);
    render(<AirlineMark code="TK" className="mark" nameClassName="nm" />);
    expect(await screen.findByAltText('Turkish Airlines')).toBeInTheDocument();
  });

  it('renders an initial rather than nothing when the directory lookup fails', async () => {
    axiosInstance.get.mockRejectedValue(new Error('cache down'));
    const { container } = render(<AirlineMark code="TK" className="mark" />);
    // Falls through to the static name table, so the mark is never blank.
    await waitFor(() => expect(container.querySelector('.mark')).toHaveTextContent('T'));
  });
});
