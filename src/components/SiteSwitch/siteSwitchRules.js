/** Which site a visitor is on, and which to offer them (SiteSwitch.jsx). */

export const siteOfHost = (host) => {
  const h = String(host || '').toLowerCase().replace(/^www\./, '');
  return h === 'sunsky.be' ? 'BE' : h === 'sunsky.nl' ? 'NL' : null;
};

/** PURE. Which site to offer: the visitor's country's, when it is the other one; else null. */
export function siteToOffer(here, country) {
  if (!here || !country || here === country) return null;
  return country === 'BE' || country === 'NL' ? country : null;
}
