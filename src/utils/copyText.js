/**
 * Copy a string to the clipboard, including on http:// staging where the async Clipboard API
 * is undefined and on iOS where a bare .select() copies nothing.
 *
 * @param {string} value
 * @returns {Promise<boolean>} whether the text made it to the clipboard
 */
export async function copyText(value) {
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch { /* blocked or unavailable — fall through to the legacy path */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);   // iOS needs the explicit range
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

export default copyText;
