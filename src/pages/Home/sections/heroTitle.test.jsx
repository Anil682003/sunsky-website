import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderHeroTitleParts, renderHeroTitle } from './heroTitle';

/**
 * Which word of the hero headline is gold.
 *
 * SUNSKY wanted "Vind jouw **zon** bestemming" and got "Vind jouw zon
 * **bestemming**", because the title was one string and the accented word was
 * marked with asterisks that nothing in the dashboard mentioned. It is three
 * fields now, and the middle one is the accent. Getting that wrong is invisible
 * in a diff and obvious on the homepage, which is what these are for.
 */

const SCRIPT = 'gold';
const gold = () => document.querySelector('.gold');
const draw = (node) => render(<h1>{node}</h1>);

describe('a title stored as three fields', () => {
  it('accents the middle field and nothing else', () => {
    draw(renderHeroTitleParts({ before: 'Vind jouw', highlight: 'zon', after: 'bestemming' }, SCRIPT));

    expect(gold()).toHaveTextContent('zon');
    expect(screen.getByRole('heading')).toHaveTextContent('Vind jouw zon bestemming');
    // The words either side must stay out of the accent, which is the whole fault.
    expect(gold()).not.toHaveTextContent('Vind');
    expect(gold()).not.toHaveTextContent('bestemming');
  });

  it('puts single spaces between the parts, whatever was typed', () => {
    // The dashboard cannot show trailing whitespace, so nobody can see a stray
    // space to remove it.
    draw(renderHeroTitleParts({ before: 'Vind jouw  ', highlight: '  zon ', after: ' bestemming' }, SCRIPT));
    expect(screen.getByRole('heading').textContent).toBe('Vind jouw zon bestemming');
  });

  it('leaves the title unaccented when the middle field is empty', () => {
    draw(renderHeroTitleParts({ before: 'Vind jouw bestemming', highlight: '', after: '' }, SCRIPT));
    expect(gold()).toBeNull();
    expect(screen.getByRole('heading')).toHaveTextContent('Vind jouw bestemming');
  });

  it('drops the space where a part is missing rather than leaving a gap', () => {
    draw(renderHeroTitleParts({ before: '', highlight: 'zon', after: 'bestemming' }, SCRIPT));
    expect(screen.getByRole('heading').textContent).toBe('zon bestemming');

    draw(renderHeroTitleParts({ before: 'Vind jouw', highlight: 'zon', after: '' }, SCRIPT));
    expect(screen.getAllByRole('heading')[1].textContent).toBe('Vind jouw zon');
  });

  it('keeps a newline in a part as a line break', () => {
    const { container } = draw(
      renderHeroTitleParts({ before: 'Waar ga jij\nde', highlight: 'zon', after: 'achterna?' }, SCRIPT)
    );
    expect(container.querySelectorAll('br')).toHaveLength(1);
  });

  // Null is the signal to fall through to the older single-field title, so an
  // empty set of parts must never render as an empty headline.
  it('is nothing at all when every part is empty', () => {
    expect(renderHeroTitleParts({ before: '', highlight: '', after: '' }, SCRIPT)).toBeNull();
    expect(renderHeroTitleParts({}, SCRIPT)).toBeNull();
    expect(renderHeroTitleParts(undefined, SCRIPT)).toBeNull();
  });
});

describe('the older single-field title', () => {
  it('still accents the asterisked word', () => {
    draw(renderHeroTitle('Vind jouw zon *bestemming*', SCRIPT));
    expect(gold()).toHaveTextContent('bestemming');
  });

  it('accents the word for sun when nothing is marked', () => {
    draw(renderHeroTitle('Waar ga jij de zon achterna?', SCRIPT));
    expect(gold()).toHaveTextContent('zon');
  });

  it('renders nothing for an empty title', () => {
    expect(renderHeroTitle('', SCRIPT)).toBeNull();
  });
});
