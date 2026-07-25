import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import HotelImg from './HotelImg';

const CDN = 'https://photos.hotelbeds.com/giata/';
const PATH = '19/196700/196700a_hb_a_005.jpg';

const fireError = (img) => fireEvent.error(img);

describe('HotelImg', () => {
  it('starts at the requested size', () => {
    render(<HotelImg src={CDN + PATH} size="bigger" alt="hotel" />);
    expect(screen.getByRole('img')).toHaveAttribute('src', `${CDN}bigger/${PATH}`);
  });

  it('steps down the size chain each time the image fails', () => {
    // This is the fix for the blank gallery tiles: Bamboo's `xl` 403s, so a request that
    // fails must drop to a size that exists rather than showing nothing.
    render(<HotelImg src={CDN + PATH} size="original" alt="hotel" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', `${CDN}original/${PATH}`);

    fireError(img);
    expect(img).toHaveAttribute('src', `${CDN}bigger/${PATH}`);

    fireError(img);
    expect(img).toHaveAttribute('src', CDN + PATH);   // default — the reliable floor
  });

  it('calls the caller onError only after every size has failed', () => {
    const onError = vi.fn();
    render(<HotelImg src={CDN + PATH} size="bigger" alt="hotel" onError={onError} />);
    const img = screen.getByRole('img');

    fireError(img);                       // bigger → default
    expect(onError).not.toHaveBeenCalled();
    expect(img).toHaveAttribute('src', CDN + PATH);

    fireError(img);                       // default failed → exhausted
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('forwards arbitrary img props (className, loading, alt)', () => {
    render(<HotelImg src={CDN + PATH} size="bigger" alt="Le Bamboo" className="gi-img" loading="lazy" />);
    const img = screen.getByRole('img', { name: 'Le Bamboo' });
    expect(img).toHaveClass('gi-img');
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('uses a non-Hotelbeds URL as-is, with no stepping', () => {
    const ovh = 'https://sunsky-assets.s3.rbx.io.cloud.ovh.net/hotels/x.jpg';
    const onError = vi.fn();
    render(<HotelImg src={ovh} size="original" alt="hotel" onError={onError} />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', ovh);
    fireError(img);                        // nothing to fall back to → straight to caller
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('restarts the chain when the src changes', () => {
    const A = CDN + '19/196700/196700a_hb_a_005.jpg';
    const B = CDN + '00/000022/000022a_hb_a_005.jpg';
    const { rerender } = render(<HotelImg src={A} size="original" alt="hotel" />);
    const img = screen.getByRole('img');
    fireError(img);                        // A: original → bigger
    expect(img).toHaveAttribute('src', `${CDN}bigger/19/196700/196700a_hb_a_005.jpg`);

    rerender(<HotelImg src={B} size="original" alt="hotel" />);
    expect(img).toHaveAttribute('src', `${CDN}original/00/000022/000022a_hb_a_005.jpg`);   // fresh start
  });
});
