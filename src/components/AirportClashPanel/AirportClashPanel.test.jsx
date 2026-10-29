import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AirportClashPanel from './AirportClashPanel';

/**
 * UI-06. The panel says what `clashingAirports` decided, in the site's words, and hands the
 * answer back. It decides nothing, so these tests are about what the traveller reads and what
 * each way out does. (The suite renders in Dutch, the site's default.)
 */

const some = { state: 'some', clashing: ['ANR'], keep: ['BRU'] };
const all = { state: 'all', clashing: ['BRU', 'ANR'], keep: [] };

const renderPanel = (props = {}) => {
  const onRemove = vi.fn();
  const onKeep = vi.fn();
  render(<AirportClashPanel verdict={some} destinations={['Antalya']} onRemove={onRemove} onKeep={onKeep} {...props} />);
  return { onRemove, onKeep };
};

describe('AirportClashPanel', () => {
  it('names the airport that does not fit, the destination, and the airports that still do', () => {
    renderPanel();
    const dialog = screen.getByRole('alertdialog');
    // The seed registry names ANR "Antwerp"; the dashboard's Dutch list says "Antwerpen".
    expect(dialog).toHaveTextContent('Antwerp (ANR) vliegt niet naar Antalya');
    expect(dialog).toHaveTextContent('Vanaf Brussels (BRU) kan het wel.');
    // The question is labelled by what it is about, for a screen reader landing on it.
    expect(dialog).toHaveAccessibleName('Antwerp (ANR) vliegt niet naar Antalya');
  });

  it('offers to remove exactly the clashing airports, or to keep everything', () => {
    const { onRemove, onKeep } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'ANR verwijderen en doorgaan' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Mijn luchthavens behouden' }));
    expect(onKeep).toHaveBeenCalledTimes(1);
  });

  it('takes focus when it appears, and Escape keeps the airports', () => {
    const { onKeep, onRemove } = renderPanel();
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onKeep).toHaveBeenCalledTimes(1);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('with every airport stranded it says so and offers no removal', () => {
    renderPanel({ verdict: all });
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Brussels (BRU) en Antwerp (ANR) vliegen niet naar Antalya');
    expect(dialog).toHaveTextContent('Kies eerst een andere vertrekluchthaven');
    expect(screen.queryByRole('button', { name: /verwijderen/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Mijn luchthavens behouden' })).toBeInTheDocument();
  });

  it('two places picked: the airport reaches neither, so it says "or"', () => {
    renderPanel({ destinations: ['Antalya', 'Side'] });
    expect(screen.getByRole('alertdialog')).toHaveTextContent('vliegt niet naar Antalya of Side');
  });

  it('while the check runs it says so quietly, and asks nothing', () => {
    renderPanel({ verdict: { state: 'unknown', clashing: [], keep: ['BRU', 'ANR'] }, checking: true });
    expect(screen.getByRole('status')).toHaveTextContent('We kijken welke van je luchthavens naar Antalya vliegen');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('nothing to ask and nothing being checked renders nothing at all', () => {
    for (const verdict of [{ state: 'none', clashing: [], keep: [] }, { state: 'unknown', clashing: [], keep: ['BRU'] }]) {
      const { container, unmount } = render(<AirportClashPanel verdict={verdict} destinations={['Antalya']} />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });
});
