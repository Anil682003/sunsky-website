import Navbar from './Navbar/Navbar';
import Footer from './Footer/Footer';

/**
 * The shell every page in the site sits in.
 *
 * `footer` is opt-OUT rather than opt-in: a page without one is the exception, and the
 * exception should have to say so. The hotel page is that exception — it ends in its own
 * booking decision, and a full sitemap under it only offers a traveller somewhere else to go.
 */
export default function Layout({ children, footer = true }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh' }}>
      <Navbar />
      <main style={{ flex:1 }}>{children}</main>
      {footer && <Footer />}
    </div>
  );
}
