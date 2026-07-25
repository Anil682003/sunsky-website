import { useState, useMemo } from 'react';
import { hotelImageChain } from '../../utils/hotelImage';

// An <img> that requests a hotel photo at a preferred Hotelbeds CDN size and, if that size is
// missing (many images lack the larger variants — `xl` in particular returns 403), falls back
// through progressively smaller real sizes down to `default`, which the CDN always serves.
//
// This is why gallery tiles were painting blank: they asked for a size the image didn't have,
// the <img> errored, and nothing was shown. Now the error steps down the chain instead.
//
// A non-Hotelbeds photo (an OVH upload, an Unsplash fallback) has no variants and is used as-is.
// When EVERY candidate fails, the caller's own `onError` runs, so a page can still drop in its
// placeholder (e.g. hide the tile, or swap a stock image).
//
// All other props are forwarded, so this is a drop-in for <img> — className, alt, loading,
// fetchPriority, onClick, style, etc. Pass a stable `src`; changing it restarts the chain.
export default function HotelImg({ src, size = 'default', onError, ...rest }) {
  const chain = useMemo(() => hotelImageChain(src, size), [src, size]);
  const key = `${src}|${size}`;

  // Which candidate we're on. Reset to the preferred size when src/size changes by adjusting
  // state DURING RENDER (React's documented pattern for deriving state from props) rather than
  // in an effect — so there's no extra render pass and no cascading-render lint flag.
  const [state, setState] = useState({ key, i: 0 });
  const i = state.key === key ? state.i : 0;
  if (state.key !== key) setState({ key, i: 0 });

  const handleError = (e) => {
    if (i < chain.length - 1) setState({ key, i: i + 1 });   // try the next, smaller, real size
    else onError?.(e);                                        // exhausted — let the caller decide
  };

  // chain is empty only when src is empty; fall back to the raw src so we never render src="".
  const current = chain[i] ?? src;
  return <img {...rest} src={current} onError={handleError} />;
}
