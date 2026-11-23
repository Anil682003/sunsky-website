import { describe, it, expect } from 'vitest';
import { promotionInput, promotionProduct, formatDiscount, formatTotal, cents } from './promotions';

describe('promotions on the website', () => {
  it('asks only with a reliable price, rounded to cents', () => {
    expect(promotionInput({ product: 'hotel', eligiblePrice: null })).toBeNull();
    expect(promotionInput({ product: null, eligiblePrice: 600 })).toBeNull();
    expect(promotionInput({ product: 'package', hotelCode: 123, eligiblePrice: 1234.567, eligibleCost: 1000.001, travellers: '2', travelDate: '2027-05-10T08:00' }))
      .toEqual({ product: 'package', hotelCode: '123', arrivalAirport: null, travelDate: '2027-05-10', travellers: 2, eligiblePrice: 1234.57, eligibleCost: 1000, code: '', email: '' });
  });

  it('names the product like the server does', () => {
    expect(promotionProduct({ hasFlight: true, hasHotel: true })).toBe('package');
    expect(promotionProduct({ hasHotel: true })).toBe('hotel');
    expect(promotionProduct({ hasFlight: true })).toBe('flight');
    expect(promotionProduct({})).toBeNull();
  });

  it('writes the discount as −€ XX,XX and a total with cents only when it has them', () => {
    expect(formatDiscount(123.4)).toBe('−€ 123,40');
    expect(formatDiscount(-50)).toBe('−€ 50,00');
    expect(formatTotal(1110.6)).toBe('€1.110,60');
    expect(formatTotal(1110)).toBe('€1.110');
    expect(cents(0.1 + 0.2)).toBe(0.3);
  });
});
