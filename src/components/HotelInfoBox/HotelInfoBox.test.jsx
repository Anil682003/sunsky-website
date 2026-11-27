// "Belangrijke informatie van het hotel" (Levent, 27 Nov 2026): Local Taxes V1.1 + Transfer Notice V1.2.
import { describe, it, expect, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import i18n from '../../i18n';
import HotelInfoBox from './HotelInfoBox';
import { hotelInfoSections, chargesOfRate, localMoney, withEmailLinks, LC_STATE } from '../../utils/hotelInfo';

const text = (el) => el.textContent.replace(/ /g, ' ');
const NOTICE = { nl: 'Alinea een.\n\nNeem contact op via info@sunsky.be.', en: 'Paragraph one.\n\nContact info@sunsky.be.' };
const LIVE = { live: true, notice: NOTICE, deposit: null };

describe('hotelInfoSections', () => {
  it('confirmed: one total per currency, with the not-included note', () => {
    const s = hotelInfoSections({ localCharges: { state: 'confirmed', totals: [{ amount: 168, currency: 'USD' }, { amount: 12.4, currency: 'EUR' }] } });
    expect(s).toHaveLength(1);
    expect(s[0].lines.map((l) => l.key)).toEqual(['hotelInfo.total', 'hotelInfo.total']);
    expect(s[0].note).toBe('hotelInfo.notIncluded');
  });

  it('partial: known charges plus the further-unknown line; unknown: no amount', () => {
    const p = hotelInfoSections({ localCharges: { state: 'partial', totals: [{ amount: 84, currency: 'EUR' }] } })[0];
    expect(p.lines.map((l) => l.key)).toEqual(['hotelInfo.known', 'hotelInfo.furtherUnknown']);
    const u = hotelInfoSections({ localCharges: { state: 'unknown', totals: [] } })[0];
    expect(u.lines).toEqual([{ key: 'hotelInfo.unknown' }]);
  });

  it('confirmed none hides the section; no information or pending: generic line, except Diana', () => {
    expect(hotelInfoSections({ localCharges: { state: 'none', totals: [] } })).toEqual([]);
    expect(hotelInfoSections({ localCharges: { state: 'noInfo', totals: [], source: 'w2m' } })[0].lines[0].key).toBe('hotelInfo.generic');
    expect(hotelInfoSections({ localCharges: chargesOfRate({ supplier: 'hotelbeds' }) })[0].lines[0].key).toBe('hotelInfo.generic');
    expect(hotelInfoSections({ localCharges: chargesOfRate({ supplier: 'diana' }) })).toEqual([]);
  });

  it('the checked answer wins over pending', () => {
    expect(chargesOfRate({ supplier: 'hotelbeds', checked: { state: 'confirmed', totals: [] } }).state).toBe(LC_STATE.CONFIRMED);
    expect(chargesOfRate({ supplier: 'hotelbeds', checked: null }).state).toBe(LC_STATE.PENDING);
  });

  it('deposit variants: on arrival · card only · both', () => {
    const key = (d) => hotelInfoSections({ deposit: { required: true, ...d } })[0].lines[0].key;
    expect(key({ onArrival: true, creditCard: false })).toBe('hotelInfo.depositUnknown');
    expect(key({ onArrival: false, creditCard: true })).toBe('hotelInfo.depositCard');
    expect(key({ onArrival: true, creditCard: true })).toBe('hotelInfo.depositBoth');
    expect(key({ onArrival: true, creditCard: false, amount: 200, currency: 'EUR' })).toBe('hotelInfo.depositAmount');
  });

  it('notice paragraphs in the page language', () => {
    expect(hotelInfoSections({ notice: NOTICE, lang: 'nl' })[0].lines).toEqual([{ text: 'Alinea een.' }, { text: 'Neem contact op via info@sunsky.be.' }]);
    expect(hotelInfoSections({ notice: NOTICE, lang: 'en' })[0].lines[0]).toEqual({ text: 'Paragraph one.' });
  });

  it('money keeps the cents and the currency; e-mail addresses are found', () => {
    expect(localMoney(1068, 'USD', 'nl').replace(/ /g, ' ')).toBe('USD 1.068,00');
    expect(localMoney(84, 'EUR', 'nl').replace(/ /g, ' ')).toBe('€ 84,00');
    expect(localMoney(84, 'EUR', 'en')).toBe('€84.00');
    expect(withEmailLinks('mail info@sunsky.be nu')).toEqual([{ text: 'mail ' }, { email: 'info@sunsky.be' }, { text: ' nu' }]);
  });
});

describe('HotelInfoBox', () => {
  afterEach(async () => { await act(async () => { await i18n.changeLanguage('nl'); }); });

  it('renders nothing while the box is not live (the go-live switch)', () => {
    const { container } = render(<HotelInfoBox info={{ ...LIVE, live: false }} localCharges={{ state: 'confirmed', totals: [{ amount: 84, currency: 'EUR' }] }} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when live but empty', () => {
    const { container } = render(<HotelInfoBox info={{ live: true, notice: null, deposit: null }} localCharges={{ state: 'none', totals: [] }} />);
    expect(container.innerHTML).toBe('');
  });

  it('the V1.1 reference: total, note, deposit, and the notice with a clickable address', () => {
    const { container } = render(
      <HotelInfoBox
        info={{ ...LIVE, deposit: { required: true, onArrival: true, creditCard: true, amount: null, currency: null } }}
        localCharges={{ state: 'confirmed', totals: [{ amount: 84, currency: 'EUR' }] }}
      />,
    );
    const s = text(container);
    expect(s).toContain('Belangrijke informatie van het hotel');
    expect(s).toContain('Lokale belastingen en kosten');
    expect(s).toContain('Totaal ter plaatse te betalen: € 84,00');
    expect(s).toContain('Niet inbegrepen in het bedrag dat je aan SUNSKY betaalt.');
    expect(s).toContain('Bij aankomst is een creditcard vereist als waarborg. Het exacte bedrag is niet beschikbaar.');
    expect(s).toContain('Belangrijke informatie over hoteltransfers');
    expect(container.querySelector('a[href="mailto:info@sunsky.be"]')).not.toBeNull();
  });

  it('English page: English labels and the English notice', async () => {
    await act(async () => { await i18n.changeLanguage('en'); });
    const { container } = render(<HotelInfoBox info={LIVE} localCharges={{ state: 'noInfo', totals: [], source: 'w2m' }} />);
    const s = text(container);
    expect(s).toContain('Important hotel information');
    expect(s).toContain('Any applicable local taxes and charges are payable locally.');
    expect(s).toContain('Paragraph one.');
  });

  it('the confirmation shows the saved snapshot, only if it was shown at booking', () => {
    const snap = { shown: true, localCharges: { state: 'confirmed', totals: [{ amount: 168, currency: 'USD' }] }, deposit: null, notice: null };
    expect(text(render(<HotelInfoBox snapshot={snap} />).container)).toContain('USD 168,00');
    expect(render(<HotelInfoBox snapshot={{ ...snap, shown: false }} />).container.innerHTML).toBe('');
  });
});
