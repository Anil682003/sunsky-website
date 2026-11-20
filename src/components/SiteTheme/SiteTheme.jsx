import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHomepageConfig } from '../../api';
import { applySiteTheme, rememberSiteTheme, activeThemePreview, clearThemePreview } from '../../utils/siteTheme';
import styles from './SiteTheme.module.css';

/**
 * Applies the colours chosen in the dashboard (CMS > Homepage > Website Colours) to the whole
 * site as CSS variables on <html>. main.jsx already painted the last-seen theme from storage,
 * so this only corrects it once the CMS answers.
 *
 * While the dashboard's "Preview on website" is open in this tab, the unsaved colours win and
 * a small label says so, with a button to go back to the real colours.
 */
export default function SiteTheme() {
  const { t } = useTranslation('common');
  const { data } = useHomepageConfig();
  const [preview, setPreview] = useState(() => activeThemePreview());

  useEffect(() => {
    if (preview) {
      applySiteTheme(preview);
      return;
    }
    if (!data) return;
    const theme = data.theme || {};
    applySiteTheme(theme);
    rememberSiteTheme(theme);
  }, [data, preview]);

  if (!preview) return null;
  return (
    <div className={styles.badge} role="status">
      <span className={styles.dot} aria-hidden="true" />
      <span>{t('themePreview.label')}</span>
      <button
        type="button"
        className={styles.close}
        onClick={() => {
          clearThemePreview();
          setPreview(null);
        }}
      >
        {t('themePreview.close')}
      </button>
    </div>
  );
}
