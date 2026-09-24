import { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import { glyphs, loadEmoji, peekEmoji } from '../../utils/travelIcons';

/**
 * A Fluent emoji from the travel set, by name. The data arrives on demand, so until it does
 * the element keeps its size and the row does not jump when it lands. @iconify/react gives
 * every copy its own gradient ids, so the same emoji twice on a page still renders.
 */
export function TravelEmoji({ name, className = '' }) {
  // Tagged with its name, so a row whose icon changes never shows the previous drawing.
  const [loaded, setLoaded] = useState(null);
  const data = peekEmoji(name) || (loaded?.name === name ? loaded.data : null);

  useEffect(() => {
    if (peekEmoji(name)) return undefined;
    let alive = true;
    loadEmoji(name).then((d) => {
      if (alive) setLoaded({ name, data: d });
    });
    return () => {
      alive = false;
    };
  }, [name]);

  if (!data) return <span className={className} data-icon={name} aria-hidden="true" />;
  return <Icon icon={data} className={className} data-icon={name} aria-hidden="true" />;
}

/** A one-colour glyph from the travel set; it takes the surrounding text colour. */
export function TravelGlyph({ name, className = '' }) {
  const data = glyphs[name];
  return data ? <Icon icon={data} className={className} data-icon={name} aria-hidden="true" /> : null;
}
