import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import RatingMarks, { KeyMark } from './RatingMarks';
import { ratingLabel, ratingValue, isKeyRating } from '../../utils/rating';

describe('ratingLabel', () => {
  it('labels a hotel as stars and an apartment as keys', () => {
    expect(ratingLabel({ kind: 'star', value: 5 })).toBe('5-star hotel');
    expect(ratingLabel({ kind: 'key', value: 4 })).toBe('4-key apartment');
    expect(ratingLabel({ kind: 'key', value: 1 })).toBe('1-key apartment');
  });
  it('is empty when unrated', () => {
    expect(ratingLabel({ kind: 'star', value: 0 })).toBe('');
    expect(ratingLabel(null)).toBe('');
  });
});

describe('ratingValue / isKeyRating', () => {
  it('clamps the value to 0–5', () => {
    expect(ratingValue({ value: 4 })).toBe(4);
    expect(ratingValue({ value: 9 })).toBe(5);
    expect(ratingValue({ value: -1 })).toBe(0);
    expect(ratingValue(null)).toBe(0);
  });
  it('detects a usable key rating', () => {
    expect(isKeyRating({ kind: 'key', value: 3 })).toBe(true);
    expect(isKeyRating({ kind: 'star', value: 3 })).toBe(false);
    expect(isKeyRating({ kind: 'key', value: 0 })).toBe(false);
    expect(isKeyRating(null)).toBe(false);
  });
});

describe('RatingMarks', () => {
  it('renders N star characters for a hotel, no SVG', () => {
    const { container } = render(<RatingMarks rating={{ kind: 'star', value: 4 }} />);
    expect(container.textContent).toBe('★★★★');
    expect(container.querySelectorAll('svg')).toHaveLength(0);
  });
  it('renders N key glyphs (SVG) for an apartment, no stars', () => {
    const { container } = render(<RatingMarks rating={{ kind: 'key', value: 3 }} />);
    expect(container.querySelectorAll('svg')).toHaveLength(3);
    expect(container.textContent).not.toContain('★');
  });
  it('renders nothing when unrated', () => {
    expect(render(<RatingMarks rating={{ kind: 'star', value: 0 }} />).container.firstChild).toBeNull();
    expect(render(<RatingMarks rating={null} />).container.firstChild).toBeNull();
  });
  it('caps the marks at 5', () => {
    const { container } = render(<RatingMarks rating={{ kind: 'key', value: 9 }} />);
    expect(container.querySelectorAll('svg')).toHaveLength(5);
  });
  it('KeyMark is a standalone svg', () => {
    const { container } = render(<KeyMark />);
    expect(container.querySelector('svg')).toBeTruthy();
  });
});
