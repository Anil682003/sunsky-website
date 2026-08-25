/**
 * Who legally operates holidaybooking.be.
 *
 * The APD's cookie checklist expects the first layer of a cookie notice to NAME the controller
 * — the company placing the cookies — not just the brand on the door. That is a fact about a
 * real company: its registered name and its Belgian enterprise (KBO/BCE) number. Neither can
 * be guessed from the codebase, and a wrong one is worse than none, so both start empty and
 * the notice simply omits that line until the agency supplies them.
 *
 * The trading name the site already shows ("Sunsky Vliegvakanties", from the footer CMS) is
 * NOT necessarily the legal entity, so it is deliberately not used as a fallback here.
 *
 * To fill in: set both strings. Nothing else needs to change.
 */
export const CONTROLLER = {
  /** Registered company name, e.g. "Example Travel BV". */
  name: '',
  /** Belgian enterprise number, e.g. "BE 0123.456.789". */
  enterpriseNumber: '',
};
