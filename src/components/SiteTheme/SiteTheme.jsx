import { useEffect } from 'react';
import { useHomepageConfig } from '../../api';
import { applySiteTheme, rememberSiteTheme } from '../../utils/siteTheme';

/**
 * Renders nothing. Applies the colours chosen in the dashboard (CMS > Homepage > Colours) to
 * the whole site as CSS variables on <html>. main.jsx already painted the last-seen theme from
 * storage, so this only corrects it once the CMS answers.
 */
export default function SiteTheme() {
  const { data } = useHomepageConfig();
  useEffect(() => {
    if (!data) return;
    const theme = data.theme || {};
    applySiteTheme(theme);
    rememberSiteTheme(theme);
  }, [data]);
  return null;
}
