// Friendly names for the IATA airport codes and airline codes that come back on the
// live flight-availability response. The supplier (Airtuerk) returns bare codes — "TK",
// "BRU", "IST" — which are opaque to a traveller, so the flight card resolves them to
// "Turkish Airlines", "Brussels", "Istanbul". Anything not in these tables falls back to
// the raw code, so an unknown airport/airline degrades to what the API sent, never blank.
//
// Scope is the routes this agency actually sells (Belgium/Netherlands departures to the
// Mediterranean sun destinations), not the whole world — keep it that way.

const AIRPORTS = {
  // departure side — BE/NL/west DE
  BRU: 'Brussels', CRL: 'Brussels Charleroi', ANR: 'Antwerp',
  AMS: 'Amsterdam', RTM: 'Rotterdam', EIN: 'Eindhoven', MST: 'Maastricht', GRQ: 'Groningen',
  NRN: 'Weeze', DUS: 'Düsseldorf', CGN: 'Cologne', FRA: 'Frankfurt', LUX: 'Luxembourg',
  // Turkey
  IST: 'Istanbul', SAW: 'Istanbul Sabiha Gökçen', AYT: 'Antalya', ADB: 'İzmir',
  ESB: 'Ankara', BJV: 'Bodrum', DLM: 'Dalaman', GZP: 'Gazipaşa · Alanya', TZX: 'Trabzon',
  // Spain + islands
  PMI: 'Palma de Mallorca', BCN: 'Barcelona', AGP: 'Málaga', ALC: 'Alicante', VLC: 'Valencia',
  IBZ: 'Ibiza', MAH: 'Menorca', TFS: 'Tenerife South', TFN: 'Tenerife North', LPA: 'Gran Canaria',
  ACE: 'Lanzarote', FUE: 'Fuerteventura', SPC: 'La Palma',
  // Greece
  ATH: 'Athens', HER: 'Heraklion', CHQ: 'Chania', RHO: 'Rhodes', CFU: 'Corfu', KGS: 'Kos',
  JMK: 'Mykonos', JTR: 'Santorini', ZTH: 'Zakynthos', SKG: 'Thessaloniki', PVK: 'Preveza',
  // Egypt / N-Africa / E-Med
  HRG: 'Hurghada', SSH: 'Sharm el-Sheikh', RMF: 'Marsa Alam', CAI: 'Cairo',
  RAK: 'Marrakech', AGA: 'Agadir', NBE: 'Enfidha', DJE: 'Djerba', MIR: 'Monastir', TUN: 'Tunis',
  LCA: 'Larnaca', PFO: 'Paphos', FAO: 'Faro', TIA: 'Tirana',
  // Italy / Portugal / Croatia
  NAP: 'Naples', CTA: 'Catania', PMO: 'Palermo', OLB: 'Olbia', CAG: 'Cagliari',
  LIS: 'Lisbon', OPO: 'Porto', DBV: 'Dubrovnik', SPU: 'Split',
};

const AIRLINES = {
  TK: 'Turkish Airlines', PC: 'Pegasus Airlines', XQ: 'SunExpress', XC: 'Corendon Airlines',
  SN: 'Brussels Airlines', TB: 'TUI fly Belgium', HV: 'Transavia', TO: 'Transavia France',
  OR: 'TUI fly Netherlands', X3: 'TUI fly Deutschland', 4: 'Eurowings Discover', EW: 'Eurowings',
  LH: 'Lufthansa', FR: 'Ryanair', U2: 'easyJet', W6: 'Wizz Air', W4: 'Wizz Air Malta',
  AF: 'Air France', KL: 'KLM', VY: 'Vueling', IB: 'Iberia', A3: 'Aegean Airlines',
  MS: 'EgyptAir', AT: 'Royal Air Maroc', TU: 'Tunisair', CAI: 'Corendon',
  // legacy display names some feeds still send
  ARKEFLY: 'TUI fly', TRANSAVIA: 'Transavia', PEGASUS: 'Pegasus Airlines',
};

const clean = (s) => String(s || '').trim();

// City/airport name for an IATA code. Unknown → the code itself, uppercased.
export const airportName = (code) => {
  const c = clean(code).toUpperCase();
  return AIRPORTS[c] || c;
};

// Airline name for a marketing code (or a legacy full name). Unknown → the code as sent.
export const airlineName = (code) => {
  const c = clean(code);
  return AIRLINES[c.toUpperCase()] || AIRLINES[c] || c;
};

// "TK 1942" from a leg. Handles a missing flight number.
export const flightNumber = (leg) => {
  const code = clean(leg?.airline).toUpperCase();
  const no = clean(leg?.flightNumber);
  return no ? `${code} ${no}` : code;
};
