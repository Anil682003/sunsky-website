import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import AirlineMark from './AirlineMark';
import { __resetAirlineLogos } from '../../utils/airlineLogos';
import axiosInstance from '../../services/axiosInstance';

vi.mock('../../services/axiosInstance', () => ({
  default: { get: vi.fn() },
}));

const directory = (rows) => { axiosInstance.get.mockResolvedValue({ data: { data: rows } }); };

// The mark is round now, so a wordmark inside it is a smudge rather than a word — which is
// why the NAME is printed ahead of it on every row. These tests hold that order, and hold the
// image to being decorative: the name is text, so an alt saying the same thing again would
// have a screen reader read the carrier twice.
const findImg = (container) => waitFor(() => {
  const img = container.querySelector('img');
  expect(img).not.toBeNull();
  return img;
});

describe('AirlineMark', () => {
  beforeEach(() => {
    __resetAirlineLogos();
    vi.clearAllMocks();
  });

  it('renders the uploaded logo when the dashboard has one', async () => {
    directory([{ iataCode: 'TK', name: 'Turkish Airlines', logo: 'https://cdn.test/tk.png' }]);
    const { container } = render(<AirlineMark code="TK" className="mark" />);
    const img = await findImg(container);
    expect(img.getAttribute('src')).toBe('https://cdn.test/tk.png');
    // The host's class survives, because each page sizes this slot from its own stylesheet.
    expect(img.className).toContain('mark');
  });

  it('matches the code case-insensitively and ignores stray whitespace', async () => {
    directory([{ iataCode: 'TK', name: 'Turkish Airlines', logo: 'https://cdn.test/tk.png' }]);
    const { container } = render(<AirlineMark code=" tk " className="mark" />);
    const img = await findImg(container);
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
    const img = await findImg(container);
    await act(async () => { img.dispatchEvent(new Event('error')); });
    await waitFor(() => expect(container.querySelector('img')).toBeNull());
    expect(container.querySelector('.mark')).toHaveTextContent('T');
  });

  it('prints the name beside a logo, not only when one is missing', async () => {
    directory([{ iataCode: 'TK', name: 'Turkish Airlines', logo: 'https://cdn.test/tk.png' }]);
    const { container } = render(<AirlineMark code="TK" className="mark" nameClassName="nm" />);
    await findImg(container);
    expect(container.querySelector('.nm')).toHaveTextContent('Turkish Airlines');
  });

  it('puts the name BEFORE the mark', async () => {
    directory([{ iataCode: 'TK', name: 'Turkish Airlines', logo: 'https://cdn.test/tk.png' }]);
    const { container } = render(<AirlineMark code="TK" className="mark" nameClassName="nm" />);
    await findImg(container);
    const order = [...container.children].map((el) => el.className);
    expect(order[0]).toContain('nm');
    expect(order[1]).toContain('mark');
  });

  it('prints the name with no logo too, so a lone initial is never the whole answer', async () => {
    directory([{ iataCode: 'UR', name: 'Uganda Airlines', logo: null }]);
    const { container } = render(<AirlineMark code="UR" className="mark" nameClassName="nm" />);
    await waitFor(() => expect(container.querySelector('.nm')).toHaveTextContent('Uganda Airlines'));
    expect(container.querySelector('.mark')).toHaveTextContent('U');
  });

  it('keeps the name when a stored logo fails to load', async () => {
    directory([{ iataCode: 'TK', name: 'Turkish Airlines', logo: 'https://cdn.test/gone.png' }]);
    const { container } = render(<AirlineMark code="TK" className="mark" nameClassName="nm" />);
    const img = await findImg(container);
    await act(async () => { img.dispatchEvent(new Event('error')); });
    await waitFor(() => expect(container.querySelector('.nm')).toHaveTextContent('Turkish Airlines'));
  });

  it('names the airline once for a screen reader, not twice', async () => {
    directory([{ iataCode: 'TK', name: 'Turkish Airlines', logo: 'https://cdn.test/tk.png' }]);
    const { container } = render(<AirlineMark code="TK" className="mark" nameClassName="nm" />);
    const img = await findImg(container);
    // Decorative: the printed name beside it is the label. An alt repeating it would be read out
    // a second time, and `role="img"` would announce an image that adds nothing.
    expect(img.getAttribute('alt')).toBe('');
    expect(screen.queryAllByText('Turkish Airlines')).toHaveLength(1);
  });

  it('can be told to keep quiet where the row already names the carrier', async () => {
    directory([{ iataCode: 'TK', name: 'Turkish Airlines', logo: null }]);
    const { container } = render(<AirlineMark code="TK" className="mark" nameClassName={null} />);
    await waitFor(() => expect(container.querySelector('.mark')).toHaveTextContent('T'));
    expect(container.textContent).not.toContain('Turkish Airlines');
  });

  it('renders an initial rather than nothing when the directory lookup fails', async () => {
    axiosInstance.get.mockRejectedValue(new Error('cache down'));
    const { container } = render(<AirlineMark code="TK" className="mark" />);
    // Falls through to the static name table, so the mark is never blank.
    await waitFor(() => expect(container.querySelector('.mark')).toHaveTextContent('T'));
  });
});
