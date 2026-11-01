// The header's way into the checkout's own sign-in dialog (Nov 2026).
//
// The trip being booked lives in the checkout's router state. Following the header's "Sign in"
// to /login unmounted the checkout, and an existing customer who signed in mid-booking came back
// to an empty "nothing to check out" page. So while a checkout is on screen it registers the
// opener of its in-page dialog here, and the header asks for that first: nothing unmounts and
// everything already typed stays where it is. With no checkout mounted the header simply
// follows its link as before.
//
// A stack rather than a single slot: if two checkouts ever overlap (one leaving as the next one
// arrives), the leaving one's unregister must not switch off the one now on screen. The most
// recent registration that is still there is the only one that answers.

import { reportError } from './errorReporter';

const handlers = [];

/** Makes `handler(options)` the opener the header calls. Returns the function that removes it. */
export function registerCheckoutSignIn(handler) {
  const entry = { handler };
  handlers.push(entry);
  return () => {
    const at = handlers.indexOf(entry);
    if (at !== -1) handlers.splice(at, 1);
  };
}

/**
 * Is a checkout with a booking still to pay on screen? The header asks at CLICK time, not while
 * rendering: the checkout registers in an effect, after the header has already rendered.
 */
export function checkoutCanResume() {
  return handlers.length > 0;
}

/**
 * Opens the mounted checkout's sign-in dialog. True when one was opened; false when no checkout
 * is listening, and the caller should go to the sign-in page the normal way.
 */
export function openCheckoutSignIn(options = {}) {
  const entry = handlers[handlers.length - 1];
  if (!entry || typeof entry.handler !== 'function') return false;
  try {
    entry.handler(options);
    return true;
  } catch (err) {
    // A broken dialog must not also close the way in: false sends the header on to the sign-in
    // page, which carries the booking back. Reported, because nobody would tell us otherwise.
    reportError(err, { kind: 'checkout-signin' });
    return false;
  }
}
