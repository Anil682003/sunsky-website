import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import i18n from '../../i18n';
import LocalCosts from './LocalCosts';
import { localCost } from '../../utils/localCosts';

describe('LocalCosts', () => {
  it('nothing known renders nothing at all', () => {
    const { container } = render(<LocalCosts cost={null} payable={1098} />);
    expect(container.innerHTML).toBe('');
  });

  it('a known amount keeps its cents: € 12,40 in Dutch, € 12.40 in English', async () => {
    const { container } = render(<LocalCosts cost={localCost({ known: 12.4 })} />);
    expect(container.textContent).toBe('Verplicht ter plaatse te betalen: € 12,40');
    await act(async () => { await i18n.changeLanguage('en'); });
    try {
      expect(container.textContent).toBe('Mandatory payment locally: € 12.40');
    } finally {
      await act(async () => { await i18n.changeLanguage('nl'); });
    }
  });

  it('names the SUNSKY total first when asked, as a separate whole-euro line', () => {
    const { container } = render(<LocalCosts cost={localCost({ known: 12.4 })} payable={1098} />);
    const lines = [...container.firstChild.children].map((el) => el.textContent);
    expect(lines).toEqual(['Te betalen aan SUNSKY € 1.098', 'Verplicht ter plaatse te betalen: € 12,40']);
    // Never a sum of the two.
    expect(container.textContent).not.toMatch(/1\.110/);
  });

  it('a range is text: the kind of cost and the local rate, no total', () => {
    const { container } = render(<LocalCosts cost={localCost({ min: 7, max: 10, cost: 'touristTax' })} payable={990} />);
    expect(container.querySelector('[data-local-costs]').dataset.localCosts).toBe('range');
    expect(container.textContent).toBe('Te betalen aan SUNSKY € 990'
      + 'Verplicht ter plaatse te betalen: toeristenbelasting, lokaal tarief ca. € 7,00-€ 10,00 p.p. per nacht; het exacte bedrag wordt ter plaatse bepaald');
    // No made-up total: neither a sum with the SUNSKY price nor a stay total of the tax.
    expect(container.textContent).not.toMatch(/997|1\.000|€ 17/);
  });

  it('an amount in another currency is named in that currency, never converted', () => {
    const { container } = render(<LocalCosts cost={localCost({ known: 450, currency: 'TRY' })} />);
    expect(container.textContent).toBe('Verplicht ter plaatse te betalen: 450,00 TRY');
  });
});
