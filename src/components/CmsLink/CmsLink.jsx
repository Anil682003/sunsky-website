import { Link } from 'react-router-dom';
import { resolveCmsLink } from '../../utils/cmsLink';

/**
 * Wrap something in whatever kind of link the dashboard's URL turns out to be — or in nothing
 * at all, when there is no URL.
 *
 * The "or nothing at all" is the point. The guarantee marks render in two places and only some
 * of them will ever have a link: VVR has a website, the insurer's seal may not get one, and a
 * promise card written in the dashboard has no reason to link anywhere. Both callers would
 * otherwise grow the same three-branch conditional around their markup, and the two copies
 * would drift.
 *
 * External links get `rel="noopener noreferrer"`. `noopener` because a new tab opened from
 * here can otherwise reach back through window.opener and navigate this one; `noreferrer`
 * because which page a traveller was on is not a third party's business.
 */
export default function CmsLink({ url, className, title, children, ...rest }) {
  const link = resolveCmsLink(url);

  if (!link) return children;

  if (link.external) {
    return (
      <a
        className={className}
        href={link.href}
        title={title}
        target="_blank"
        rel="noopener noreferrer"
        {...rest}
      >
        {children}
      </a>
    );
  }

  return (
    <Link className={className} to={link.href} title={title} {...rest}>
      {children}
    </Link>
  );
}
