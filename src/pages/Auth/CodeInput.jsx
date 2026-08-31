import { useRef } from 'react';
import fp from './ForgotPassword.module.css';

/**
 * Six-box one-time-code field: auto-advance, backspace steps back, paste fills
 * the row. Shared by password reset and signup verification so the two behave
 * identically — a customer who has used one should find no surprises in the other.
 *
 * Styles live in ForgotPassword.module.css alongside the rest of the auth shell,
 * which Login.module.css already establishes as shared across these pages.
 */
export const CODE_LENGTH = 6;

export default function CodeInput({ value, onChange, disabled, invalid }) {
  const refs = useRef([]);

  const setDigit = (i, digit) => {
    const next = value.split('');
    next[i] = digit;
    onChange(next.join('').slice(0, CODE_LENGTH));
  };

  const handleChange = (i, raw) => {
    const digits = raw.replace(/\D/g, '');
    if (!digits) return;
    if (digits.length > 1) {
      // Typing/pasting several digits at once fills forward from here.
      const merged = (value.slice(0, i) + digits).slice(0, CODE_LENGTH).padEnd(value.length, '');
      onChange(merged.slice(0, CODE_LENGTH));
      refs.current[Math.min(i + digits.length, CODE_LENGTH - 1)]?.focus();
      return;
    }
    setDigit(i, digits);
    if (i < CODE_LENGTH - 1) refs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (value[i]) setDigit(i, '');
      else if (i > 0) { setDigit(i - 1, ''); refs.current[i - 1]?.focus(); }
    } else if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    else if (e.key === 'ArrowRight' && i < CODE_LENGTH - 1) refs.current[i + 1]?.focus();
  };

  const handlePaste = (e) => {
    const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (!digits) return;
    e.preventDefault();
    onChange(digits);
    refs.current[Math.min(digits.length, CODE_LENGTH - 1)]?.focus();
  };

  return (
    <div className={`${fp.codeRow} ${invalid ? fp.codeRowInvalid : ''}`} onPaste={handlePaste}>
      {Array.from({ length: CODE_LENGTH }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          className={`${fp.codeBox} ${value[i] ? fp.codeBoxFilled : ''}`}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={CODE_LENGTH}
          value={value[i] || ''}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
          disabled={disabled}
          aria-label={`Digit ${i + 1} of ${CODE_LENGTH}`}
        />
      ))}
    </div>
  );
}
