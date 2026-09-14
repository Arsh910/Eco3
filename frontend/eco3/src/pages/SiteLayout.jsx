import { useEffect } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import '@fontsource-variable/outfit';
import { Seo } from '../components/Seo';
import logo from '../assets/site/logo.webp';
import './pages.css';

function Brand() {
  return (
    <Link to="/" className="site__brand">
      <img src={logo} alt="" width="28" height="28" />
      eco3
    </Link>
  );
}

// Shared shell for the marketing pages: head tags, header, footer.
export function SiteLayout({ title, description, path, children }) {
  const { pathname } = useLocation();

  // A new page should start at the top, as it would on a normal site.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="site">
      <Seo title={title} description={description} path={path} />

      <header className="site__header">
        <Brand />
        <nav className="site__nav" aria-label="Main">
          <NavLink to="/how-it-works">How it works</NavLink>
          <NavLink to="/large-file-transfer">Large file transfer</NavLink>
        </nav>
        <Link to="/app" className="btn btn--light">Open eco3</Link>
      </header>

      <main className="site__main">{children}</main>

      <footer className="site__footer">
        <div>
          <Brand />
          <p>Files go straight from one browser to another. Nothing is uploaded, and there’s no account.</p>
        </div>
        <nav className="site__footer-col" aria-label="Learn">
          <p className="site__footer-title">Learn</p>
          <Link to="/how-it-works">How it works</Link>
          <Link to="/large-file-transfer">How to transfer large files</Link>
        </nav>
        <nav className="site__footer-col" aria-label="Product">
          <p className="site__footer-title">Product</p>
          <Link to="/">Home</Link>
          <Link to="/app">Open eco3</Link>
        </nav>
      </footer>
    </div>
  );
}
