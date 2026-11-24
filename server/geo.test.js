import { describe, it, expect } from 'vitest';
import { countryOfIp, clientIp } from './geo.js';

// The local Belgian / Dutch IP list (server/data/ip-country-be-nl.json, from RIPE).
describe('countryOfIp', () => {
  it('Belgian and Dutch providers, IPv4 and IPv6', () => {
    expect(countryOfIp('81.82.1.1')).toBe('BE');          // Telenet
    expect(countryOfIp('2a02:a03f::1')).toBe('BE');       // Telenet IPv6
    expect(countryOfIp('::ffff:81.82.1.1')).toBe('BE');   // IPv4 in IPv6 form
    expect(countryOfIp('145.53.1.1')).toBe('NL');         // KPN
    expect(countryOfIp('83.80.1.1')).toBe('NL');          // Ziggo
  });
  it('any other country, or no address, is nobody: never prompted', () => {
    expect(countryOfIp('8.8.8.8')).toBeNull();
    expect(countryOfIp('91.134.71.79')).toBeNull();       // our own server, France
    expect(countryOfIp('2001:4860:4860::8888')).toBeNull();
    expect(countryOfIp('')).toBeNull();
    expect(countryOfIp('not-an-ip')).toBeNull();
  });
});

describe('clientIp', () => {
  it('the address Caddy received the connection from (the last X-Forwarded-For entry), never one the client wrote', () => {
    expect(clientIp({ headers: { 'x-forwarded-for': '1.2.3.4, 81.82.1.1' } })).toBe('81.82.1.1');
    expect(clientIp({ headers: {}, socket: { remoteAddress: '145.53.1.1' } })).toBe('145.53.1.1');
  });
});
