// Security SPE-01: the guest's booking token is kept per booking and sent only for that booking.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  rememberBookingToken, bookingTokenFor, bookingIdFromUrl, bookingTokenHeaders, _resetBookingAccess,
} from './bookingAccess';
import axiosInstance from './axiosInstance';

describe('bookingAccess', () => {
  beforeEach(() => { _resetBookingAccess(); vi.useRealTimers(); });

  it('finds the booking id in every online-booking call, and nothing else', () => {
    expect(bookingIdFromUrl('/website/online-bookings/123')).toBe('123');
    expect(bookingIdFromUrl('/website/online-bookings/123/confirm')).toBe('123');
    expect(bookingIdFromUrl('/website/online-bookings/123/create-payment-intent')).toBe('123');
    expect(bookingIdFromUrl('https://api.x/api/website/online-bookings/9/payment')).toBe('9');
    expect(bookingIdFromUrl('/website/online-bookings')).toBe(null);
    expect(bookingIdFromUrl('/website/bookings/123')).toBe(null);
    expect(bookingIdFromUrl(undefined)).toBe(null);
  });

  it('sends a booking\'s token only with calls for that booking', () => {
    rememberBookingToken(123, 'tok-123');
    expect(bookingTokenHeaders('/website/online-bookings/123/payment')).toEqual({ 'X-Booking-Token': 'tok-123' });
    expect(bookingTokenHeaders('/website/online-bookings/124/payment')).toEqual({});
    expect(bookingTokenHeaders('/website/online-bookings')).toEqual({});
    expect(bookingTokenHeaders('/hotel-availability/search')).toEqual({});
  });

  it('survives a page load (the redirect return page) through localStorage', () => {
    rememberBookingToken('77', 'tok-77');
    expect(JSON.parse(window.localStorage.getItem('sunsky_booking_access'))['77'].t).toBe('tok-77');
    expect(bookingTokenFor(77)).toBe('tok-77');
  });

  it('forgets entries older than 7 days and keeps only the last 10', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T10:00:00Z'));
    rememberBookingToken(1, 'old');
    vi.setSystemTime(new Date('2026-11-09T10:00:00Z'));
    for (let i = 2; i <= 12; i += 1) rememberBookingToken(i, `t${i}`);
    const stored = JSON.parse(window.localStorage.getItem('sunsky_booking_access'));
    expect(Object.keys(stored)).toHaveLength(10);
    expect(stored['1']).toBeUndefined();
    expect(stored['12'].t).toBe('t12');
  });

  it('ignores empty input and broken storage', () => {
    rememberBookingToken(5, '');
    rememberBookingToken(null, 'x');
    expect(bookingTokenFor(5)).toBe(null);
    window.localStorage.setItem('sunsky_booking_access', '{not json');
    expect(bookingTokenFor(5)).toBe(null);
  });

  it('the axios interceptor adds the header to online-booking calls', async () => {
    rememberBookingToken(321, 'tok-321');
    const seen = [];
    const adapter = async (config) => { seen.push(config.headers['X-Booking-Token']); return { data: {}, status: 200, statusText: 'OK', headers: {}, config }; };
    await axiosInstance.post('/website/online-bookings/321/confirm', {}, { adapter });
    await axiosInstance.get('/website/online-bookings/322', { adapter });
    expect(seen).toEqual(['tok-321', undefined]);
  });
});
