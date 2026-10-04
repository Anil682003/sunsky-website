// The every-destination empty search is normally pre-computed (the "Show all" warmer), so it answers
// in a fraction of a second. If it fails, or has not answered in this long, the empty search is
// priced over the popular destinations instead — under "Popular destinations" — rather than leaving
// the visitor with an error or a long wait. Only the empty search: a place the customer chose is
// never swapped for another. Its own module so a test can shorten it.
export const EMPTY_SEARCH_FALLBACK_MS = 8000;
