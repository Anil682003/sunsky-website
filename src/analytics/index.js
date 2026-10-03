/**
 * The marketing tracking layer's public surface.
 *
 * Pages import from here, never from the modules underneath. That keeps the four funnel
 * events (Tracking Master §8) the only things a page can fire, and keeps the dataLayer, the
 * container loader and Consent Mode internal - there is no supported way for a page to push
 * a fifth event or to reach Google around the consent gate.
 */

export { default as Analytics } from './Analytics';

export {
  trackSearch,
  trackViewItem,
  trackBeginCheckout,
  trackPurchase,
  purchaseAlreadySent,
  searchSignature,
} from './events';

export { contextFromBooking } from './fromBooking';
export {
  stashPurchaseContext, readPurchaseContext, clearPurchaseContext,
} from './redirectHandoff';
export { PRODUCT_TYPES } from './canonical';
export { GTM_ENABLED, TRACKING_ENV } from './config';
