import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import NextTabTeaser, { revealProgress } from './NextTabTeaser';

describe('scrolling on to the next hotel tab', () => {
  afterEach(() => vi.restoreAllMocks());

  it('measures how much of the block is in view', () => {
    expect(revealProgress({ top: 900, height: 100 }, 800)).toBe(0);
    expect(revealProgress({ top: 750, height: 100 }, 800)).toBe(0.5);
    expect(revealProgress({ top: 600, height: 100 }, 800)).toBe(1);
    expect(revealProgress({ top: 0, height: 0 }, 800)).toBe(0);
  });

  it('switches on a scroll down once fully in view, not straight after opening, and on click', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ top: 500, height: 100 });
    const onNext = vi.fn();
    render(<NextTabTeaser label="Informatie" hint="Scroll verder voor" onNext={onNext} />);

    act(() => { window.dispatchEvent(new WheelEvent('wheel', { deltaY: 40 })); });
    expect(onNext).not.toHaveBeenCalled(); // too soon after the tab opened

    now = 1000;
    act(() => { window.dispatchEvent(new WheelEvent('wheel', { deltaY: -40 })); });
    expect(onNext).not.toHaveBeenCalled(); // scrolling up
    act(() => { window.dispatchEvent(new WheelEvent('wheel', { deltaY: 40 })); });
    expect(onNext).toHaveBeenCalledTimes(1);
    act(() => { window.dispatchEvent(new WheelEvent('wheel', { deltaY: 40 })); });
    expect(onNext).toHaveBeenCalledTimes(1); // once only

    fireEvent.click(screen.getByRole('button', { name: /Informatie/ }));
    expect(onNext).toHaveBeenCalledTimes(2);
  });
});
