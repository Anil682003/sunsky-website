/** A colour picked in the CMS for this announcement, as the strip's own variables. */
export const stripColourStyle = (a) => {
  const hex = /^#[0-9a-fA-F]{6}$/;
  if (!a || !hex.test(String(a.tone || ''))) return undefined;
  return {
    '--strip-bg': a.tone,
    '--strip-ink': hex.test(String(a.textColor || '')) ? a.textColor : '#FFFFFF',
    textShadow: 'none',
  };
};
