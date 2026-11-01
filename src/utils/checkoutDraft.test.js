import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DRAFT_KEY, DRAFT_TTL_MS, draftFingerprint, saveDraft, loadDraft, clearDraft, purgeDraft,
} from './checkoutDraft';

const raw = () => JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');

// The three shapes the checkout is handed, as HotelDetail, FlightDetail and Transfers build them.
const HOTEL = {
  hotelCode: 12345, hotelName: 'Hotel Aurora', adults: 3, currency: '€', nights: 7,
  search: {
    destination: 'AYT', origin: 'BRU', transport: 'flight', checkin: '2027-07-01', checkout: '2027-07-08',
    nights: 7, adults: 2, children: 1, rooms: 1, childAges: '9', childDobs: '2017-08-14',
  },
  api: {
    hotel: {
      hotelCode: '12345', checkin: '2027-07-01', checkout: '2027-07-08', rooms: 1,
      rateKey: '20270701|20270708|W|1|12345|DBL.ST|BB|2~1~1|9', roomCode: 'DBL.ST', boardCode: 'BB',
    },
    flight: {
      from: 'BRU', to: 'AYT', depdate: '2027-07-01', retdate: '2027-07-08', tripType: 'roundtrip',
      flightKeys: ['K-OUT-1', 'K-RET-1'],
      legs: [
        { flightNumber: '1234', departure: '2027-07-01T06:00:00' },
        { flightNumber: '1235', departure: '2027-07-08T12:00:00' },
      ],
    },
    transfer: null,
  },
};
const FLIGHT = {
  kind: 'flight', adults: 2,
  api: {
    flight: {
      from: 'BRU', to: 'AYT', depdate: '2027-05-03', tripType: 'oneway', flightKeys: ['K-A'],
      legs: [{ flightNumber: '701', departure: '2027-05-03T07:00:00' }],
    },
  },
};
const TRANSFER = {
  kind: 'transfer', adults: 2,
  api: {
    transfer: {
      fromType: 'IATA', fromCode: 'AYT', toType: 'ATLAS', toCode: '12345',
      outbound: '2027-07-01T10:00:00', rateKey: 'TR-1', transferType: 'PRIVATE', vehicleCode: 'CAR',
      direction: 'ARRIVAL',
    },
  },
};

// The checkout's own shell for "no booking in router state" (Checkout.jsx EMPTY_BOOKING).
const EMPTY_SHELL = {
  hotelCode: '', hotelName: '', stars: 0, loc: '', img: '',
  board: '', nights: 0, adults: 1, currency: '€',
  ppPrice: 0, dateLabel: '', flight: null, room: '', roomExtra: 0, meal: '',
};

const traveller = (firstName, lastName, dateOfBirth, dobLocked = false) => ({
  gender: 'F', firstName, lastName, nationality: 'BE', dateOfBirth, dobLocked,
});

const DRAFT = {
  step: 1,
  furthest: 2,
  isCompany: true,
  priv: {
    firstName: 'Anna', lastName: 'PEETERS', dateOfBirth: '1988-03-02', gender: 'F', nationality: 'BE',
    email: 'anna@example.be', phone: '+32475123456', street: 'Kerkstraat', houseNumber: '12',
    boxNumber: '', city: 'Gent', postalCode: '9000', country: 'BE', emergencyPhone: '+32470000000',
  },
  pro: { legalName: 'Peeters BV', vatNumber: 'BE0123456789' },
  leadIsBooker: true,
  travellers: [
    traveller('Anna', 'PEETERS', '1988-03-02'),
    traveller('Tom', 'PEETERS', '1986-11-20'),
    traveller('Lena', 'PEETERS', '2017-08-14', true),
  ],
  cancelIns: true,
  travelIns: { 0: true, 2: false },
  bags: { '0:out': { cabin: true, checked: 20 }, '1:ret': { cabin: null, checked: 23 } },
  transferId: 'PRIVATE|CAR|STD',
  hotelWish: 'A quiet room, please',
  noteKind: 'assistance',
  noteFor: [2],
  noteText: 'Wheelchair at the gate',
  supportCode: 'PLUS',
  payMethod: 'bancontact',
  idealBank: '',
};

const DEFAULTS = {
  step: 0, furthest: 0, isCompany: false,
  priv: {
    firstName: '', lastName: '', dateOfBirth: '', gender: '', nationality: '', email: '', phone: '',
    street: '', houseNumber: '', boxNumber: '', city: '', postalCode: '', country: '', emergencyPhone: '',
  },
  pro: { legalName: '', vatNumber: '' },
  leadIsBooker: false,
  travellers: [],
  cancelIns: false,
  travelIns: {},
  bags: {},
  transferId: null,
  hotelWish: '',
  noteKind: 'general',
  noteFor: [],
  noteText: '',
  supportCode: null,
  payMethod: 'card',
  idealBank: '',
};

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('saveDraft / loadDraft', () => {
  it('gives back the draft it was handed', () => {
    expect(saveDraft(HOTEL, DRAFT)).toBe(true);
    expect(loadDraft(HOTEL)).toEqual(DRAFT);
  });

  it('is empty before anything is saved', () => {
    expect(loadDraft(HOTEL)).toBeNull();
  });

  // The fallback path: the trip goes to /login as router state and comes back as a structured
  // clone of itself, not as the same object. It is still the same trip.
  it('restores into the same trip after it has been through history state', () => {
    saveDraft(HOTEL, DRAFT);
    expect(loadDraft(structuredClone(HOTEL))).toEqual(DRAFT);
  });

  it('works the same for a flight-only and a transfer-only checkout', () => {
    saveDraft(FLIGHT, DRAFT);
    expect(loadDraft(FLIGHT)?.priv.firstName).toBe('Anna');
    saveDraft(TRANSFER, DRAFT);
    expect(loadDraft(TRANSFER)?.transferId).toBe('PRIVATE|CAR|STD');
  });

  it('fills every missing field with the empty answer', () => {
    saveDraft(HOTEL, {});
    expect(loadDraft(HOTEL)).toEqual(DEFAULTS);
  });

  it('turns wrong-typed fields into the empty answer rather than storing them', () => {
    saveDraft(HOTEL, {
      step: 9, furthest: 'far', isCompany: 'yes', leadIsBooker: 1, cancelIns: 'true',
      priv: { firstName: 42, lastName: ['PEETERS'] }, pro: 'Peeters BV', travellers: 'Anna',
      travelIns: [true], bags: 'two', transferId: '', hotelWish: 7, noteKind: 'shout',
      noteFor: 'all', noteText: null, supportCode: 3, payMethod: 'crypto', idealBank: { bank: 'ING' },
    });
    expect(loadDraft(HOTEL)).toEqual(DEFAULTS);
  });

  it('never lets the furthest step trail the step on screen', () => {
    saveDraft(HOTEL, { step: 3, furthest: 1 });
    expect(loadDraft(HOTEL)).toMatchObject({ step: 3, furthest: 3 });
  });

  // Insurance, bags and the assistance note are all keyed by traveller index: dropping a bad
  // row would file one person's cover against the next.
  it('keeps a blank slot for a traveller row that is not a traveller', () => {
    saveDraft(HOTEL, { travellers: [{ firstName: 'Anna' }, null, { firstName: 'Lena', dobLocked: true }] });
    const { travellers } = loadDraft(HOTEL);
    expect(travellers).toHaveLength(3);
    expect(travellers[1]).toEqual({ gender: '', firstName: '', lastName: '', nationality: '', dateOfBirth: '', dobLocked: false });
    expect(travellers[2]).toMatchObject({ firstName: 'Lena', dobLocked: true });
  });

  it('caps the lengths of what it keeps', () => {
    saveDraft(HOTEL, {
      priv: { firstName: 'x'.repeat(500) },
      hotelWish: 'w'.repeat(600),
      noteText: 'n'.repeat(2000),
      travellers: Array.from({ length: 50 }, () => traveller('A', 'B', '')),
      noteFor: Array.from({ length: 50 }, (_, i) => i),
    });
    const d = loadDraft(HOTEL);
    expect(d.priv.firstName).toHaveLength(200);
    expect(d.hotelWish).toHaveLength(500);
    expect(d.noteText).toHaveLength(1000);
    expect(d.travellers).toHaveLength(40);
    expect(d.noteFor).toHaveLength(40);
  });

  it('keeps only bag selections in the checkout\'s own shape', () => {
    saveDraft(HOTEL, {
      bags: {
        '0:out': { cabin: true },
        '1:ret': { checked: 23 },
        '2:out': { cabin: 8, checked: null },
        '3:out': { cabin: false },          // adds nothing: setBag deletes these itself
        '0:ret': { cabin: 'yes', checked: '20' },
        'x:out': { cabin: true },
        '0-out': { cabin: true },
        '99:out': { cabin: true },          // no 100th traveller
        '1:out': 'cabin',
      },
    });
    expect(loadDraft(HOTEL).bags).toEqual({
      '0:out': { cabin: true, checked: null },
      '1:ret': { cabin: null, checked: 23 },
      '2:out': { cabin: 8, checked: null },
    });
  });

  it('keeps travel insurance and the assistance note against real traveller indexes only', () => {
    saveDraft(HOTEL, {
      travelIns: { 0: true, 1: 'yes', 3: false, x: true, 40: true },
      noteFor: [2, 2, '1', -1, 99, 'x', 1.5],
    });
    const d = loadDraft(HOTEL);
    expect(d.travelIns).toEqual({ 0: true, 3: false });
    expect(d.noteFor).toEqual([2, 1]);
  });
});

describe('what can never be stored', () => {
  it('drops card details, passwords, tokens and consents even when they are passed in', () => {
    saveDraft(HOTEL, {
      ...DRAFT,
      card: { name: 'ANNA PEETERS', number: '4242424242424242', expiry: '12/30', cvc: '987' },
      cvc: '987',
      cardNumber: '4242424242424242',
      password: 'hunter2-secret',
      accessToken: 'eyJhbGciOiJIUzI1NiJ9.token',
      refreshToken: 'refresh-token-value',
      conds: { BOOKING_CONDITIONS: true },
      nrAccept: true,
      priv: { ...DRAFT.priv, password: 'hunter2-secret', iban: 'BE68539007547034' },
      pro: { ...DRAFT.pro, accessToken: 'eyJhbGciOiJIUzI1NiJ9.token' },
      travellers: [{ ...DRAFT.travellers[0], passportNumber: 'EP1234567' }],
      bags: { '0:out': { cabin: true, cardNumber: '4242424242424242' } },
    });
    // The record's own envelope is fixed, and the timestamp in it is only ever a number, so the
    // search below runs over the data alone (a bare "987" could turn up inside Date.now()).
    expect(Object.keys(raw()).sort()).toEqual(['at', 'data', 'fp', 'owner', 'v']);
    const stored = JSON.stringify(raw().data);
    for (const secret of [
      '4242424242424242', '987', 'hunter2', 'eyJhbGciOiJIUzI1NiJ9', 'refresh-token-value',
      'BOOKING_CONDITIONS', 'nrAccept', 'BE68539007547034', 'EP1234567',
    ]) {
      expect(stored).not.toContain(secret);
    }
    expect(Object.keys(raw().data).sort()).toEqual(Object.keys(DEFAULTS).sort());
    expect(Object.keys(raw().data.priv).sort()).toEqual(Object.keys(DEFAULTS.priv).sort());
    expect(Object.keys(raw().data.travellers[0]).sort()).toEqual(
      ['dateOfBirth', 'dobLocked', 'firstName', 'gender', 'lastName', 'nationality'],
    );
  });

  it('drops anything not on the list from a record that was tampered with in storage', () => {
    saveDraft(HOTEL, DRAFT);
    const rec = raw();
    rec.data.card = { number: '4242424242424242' };
    rec.data.priv.password = 'hunter2';
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(rec));
    const d = loadDraft(HOTEL);
    expect(d.card).toBeUndefined();
    expect(d.priv.password).toBeUndefined();
    expect(d).toEqual(DRAFT);
  });
});

describe('the 30-minute window', () => {
  it('restores a draft saved just under 30 minutes ago', () => {
    saveDraft(HOTEL, DRAFT);
    vi.setSystemTime(Date.now() + DRAFT_TTL_MS - 1000);
    expect(loadDraft(HOTEL)?.priv.firstName).toBe('Anna');
  });

  it('restores nothing once 30 minutes have passed, and deletes the record', () => {
    saveDraft(HOTEL, DRAFT);
    vi.setSystemTime(Date.now() + DRAFT_TTL_MS + 1000);
    expect(loadDraft(HOTEL)).toBeNull();
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('restarts the window on each save, so it measures time since the last change', () => {
    saveDraft(HOTEL, DRAFT);
    vi.setSystemTime(Date.now() + DRAFT_TTL_MS - 60_000);
    saveDraft(HOTEL, { ...DRAFT, hotelWish: 'High floor' });
    vi.setSystemTime(Date.now() + DRAFT_TTL_MS - 60_000);
    expect(loadDraft(HOTEL)?.hotelWish).toBe('High floor');
  });

  it('DELETES an expired draft on purge rather than merely ignoring it', () => {
    saveDraft(HOTEL, DRAFT);
    expect(purgeDraft()).toBe(false);
    vi.setSystemTime(Date.now() + DRAFT_TTL_MS + 1000);
    expect(purgeDraft()).toBe(true);
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('treats a record with no timestamp as expired', () => {
    saveDraft(HOTEL, DRAFT);
    const { at, ...undated } = raw();
    expect(typeof at).toBe('number');
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(undated));
    expect(loadDraft(HOTEL)).toBeNull();
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('treats a record dated far in the future as expired', () => {
    saveDraft(HOTEL, DRAFT);
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...raw(), at: Date.now() + DRAFT_TTL_MS + 1000 }));
    expect(loadDraft(HOTEL)).toBeNull();
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('survives and deletes unparseable storage', () => {
    sessionStorage.setItem(DRAFT_KEY, 'not json');
    expect(loadDraft(HOTEL)).toBeNull();
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('deletes an expired draft as soon as the module loads', async () => {
    saveDraft(HOTEL, DRAFT);
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...raw(), at: Date.now() - DRAFT_TTL_MS - 1000 }));
    vi.resetModules();
    await import('./checkoutDraft');
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
  });
});

describe('one draft, one trip', () => {
  it('gives another trip nothing, and does not keep the first trip\'s details around', () => {
    saveDraft(HOTEL, DRAFT);
    expect(loadDraft(FLIGHT)).toBeNull();
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(loadDraft(HOTEL)).toBeNull();
  });

  it('treats a different rate at the same hotel as a different trip', () => {
    saveDraft(HOTEL, DRAFT);
    const otherRoom = structuredClone(HOTEL);
    otherRoom.api.hotel.rateKey = '20270701|20270708|W|1|12345|SUI.ST|AI|2~1~1|9';
    expect(loadDraft(otherRoom)).toBeNull();
  });

  it('saves nothing and reads nothing without a trip', () => {
    expect(saveDraft(EMPTY_SHELL, DRAFT)).toBe(false);
    expect(saveDraft(null, DRAFT)).toBe(false);
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
    saveDraft(HOTEL, DRAFT);
    expect(loadDraft(EMPTY_SHELL)).toBeNull();
    // A render with no trip says nothing about whose draft this is, so it is left alone.
    expect(loadDraft(HOTEL)).toEqual(DRAFT);
  });
});

describe('draftFingerprint', () => {
  it('is the same string every time for the same trip', () => {
    expect(draftFingerprint(HOTEL)).toBe(draftFingerprint(HOTEL));
    expect(draftFingerprint(structuredClone(HOTEL))).toBe(draftFingerprint(HOTEL));
    expect(draftFingerprint(FLIGHT)).toBe(draftFingerprint(structuredClone(FLIGHT)));
    expect(typeof draftFingerprint(TRANSFER)).toBe('string');
  });

  it('does not care whether a count came back as a number or as text', () => {
    const asText = structuredClone(HOTEL);
    asText.search.adults = '2';
    asText.hotelCode = '12345';
    expect(draftFingerprint(asText)).toBe(draftFingerprint(HOTEL));
  });

  it('differs between two different trips', () => {
    const variants = [
      HOTEL, FLIGHT, TRANSFER,
      (() => { const b = structuredClone(HOTEL); b.hotelCode = 67890; return b; })(),
      (() => { const b = structuredClone(HOTEL); b.api.hotel.rateKey = 'OTHER'; return b; })(),
      (() => { const b = structuredClone(HOTEL); b.api.flight.flightKeys = ['K-OUT-2', 'K-RET-1']; return b; })(),
      (() => { const b = structuredClone(HOTEL); b.api.flight.legs[0].departure = '2027-07-01T06:05:00'; return b; })(),
      (() => { const b = structuredClone(HOTEL); b.api.flight.legs[1].flightNumber = '1237'; return b; })(),
      (() => { const b = structuredClone(HOTEL); b.search.checkin = '2027-07-02'; return b; })(),
      (() => { const b = structuredClone(HOTEL); b.search.checkout = '2027-07-09'; return b; })(),
      (() => { const b = structuredClone(HOTEL); b.search.adults = 3; return b; })(),
      (() => { const b = structuredClone(HOTEL); b.search.children = 2; return b; })(),
      (() => { const b = structuredClone(HOTEL); b.search.childDobs = '2017-08-15'; return b; })(),
      (() => { const b = structuredClone(HOTEL); b.search.rooms = 2; return b; })(),
      (() => { const b = structuredClone(HOTEL); b.search.origin = 'AMS'; return b; })(),
      (() => { const b = structuredClone(HOTEL); b.search.destination = 'DLM'; return b; })(),
      (() => { const b = structuredClone(FLIGHT); b.kind = undefined; return b; })(),
      (() => { const b = structuredClone(FLIGHT); b.adults = 3; return b; })(),
      (() => { const b = structuredClone(TRANSFER); b.api.transfer.rateKey = 'TR-2'; return b; })(),
      (() => { const b = structuredClone(TRANSFER); b.api.transfer.outbound = '2027-07-01T11:00:00'; return b; })(),
      (() => { const b = structuredClone(TRANSFER); b.api.transfer.inbound = '2027-07-08T09:00:00'; return b; })(),
      (() => { const b = structuredClone(TRANSFER); b.api.transfer.vehicleCode = 'MINIBUS'; return b; })(),
    ];
    const prints = variants.map(draftFingerprint);
    expect(prints.every((p) => typeof p === 'string' && p.length > 0)).toBe(true);
    expect(new Set(prints).size).toBe(variants.length);
  });

  it('is null when there is no trip to name', () => {
    expect(draftFingerprint(null)).toBeNull();
    expect(draftFingerprint(undefined)).toBeNull();
    expect(draftFingerprint('ORD-1')).toBeNull();
    expect(draftFingerprint({})).toBeNull();
    expect(draftFingerprint(EMPTY_SHELL)).toBeNull();
    expect(draftFingerprint({ kind: 'flight', adults: 2, api: { flight: { flightKeys: [], legs: [] } } })).toBeNull();
  });
});

describe('blocked storage', () => {
  it('never throws when writing fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });
    expect(() => saveDraft(HOTEL, DRAFT)).not.toThrow();
    expect(saveDraft(HOTEL, DRAFT)).toBe(false);
  });

  it('never throws when the browser refuses access altogether', () => {
    saveDraft(HOTEL, DRAFT);
    const refuse = () => { throw new DOMException('Access is denied.', 'SecurityError'); };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(refuse);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(refuse);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(refuse);
    expect(loadDraft(HOTEL)).toBeNull();
    expect(purgeDraft()).toBe(false);
    expect(saveDraft(HOTEL, DRAFT)).toBe(false);
    expect(() => clearDraft()).not.toThrow();
  });
});

describe('clearDraft', () => {
  it('forgets the draft outright', () => {
    saveDraft(HOTEL, DRAFT);
    clearDraft();
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(loadDraft(HOTEL)).toBeNull();
  });
});

describe('whose draft it is', () => {
  it('gives a guest draft back to the guest, and to the account they sign in or sign up with', () => {
    saveDraft(HOTEL, DRAFT);
    expect(loadDraft(HOTEL)).not.toBeNull();
    expect(loadDraft(HOTEL, { owner: 42 })).not.toBeNull();
  });

  it('never gives a signed-in customer\'s draft to a guest or to another account', () => {
    saveDraft(HOTEL, DRAFT, { owner: 42 });
    expect(raw().owner).toBe('42');
    expect(loadDraft(HOTEL, { owner: 42 })).not.toBeNull();

    // Signed out on a shared computer: the next visitor gets nothing, and it is gone.
    expect(loadDraft(HOTEL)).toBeNull();
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();

    saveDraft(HOTEL, DRAFT, { owner: 42 });
    expect(loadDraft(HOTEL, { owner: 7 })).toBeNull();
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
  });
});
