import { Routes, Route } from 'react-router-dom';
import { Suspense, useEffect } from 'react';
import Layout from '../Layout/Layout';
import ProtectedRoute from '../components/ProtectedRoute';
import PublicRoute from '../components/PublicRoute';
import ScrollToTop from '../components/ScrollToTop';
import ErrorBoundary from '../components/ErrorBoundary/ErrorBoundary';
import { routes, publicRoutes, notFoundRoute, prefetchLikelyPages } from './routes.config';

// A visitor with a tab open across a deploy asks for a page file that no longer exists: reload
// once to pick up the new build instead of showing an error (Vite's preload error event).
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (e) => {
    try {
      if (sessionStorage.getItem('sunsky.reloadedForBuild')) return;
      sessionStorage.setItem('sunsky.reloadedForBuild', '1');
    } catch { /* no storage: still reload once per event */ }
    e.preventDefault();
    window.location.reload();
  });
}

function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ width: 36, height: 36, border: '3px solid #f5a51e', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function renderRoute({ path, component: Component, layout, footer, protected: isProtected }) {
  // Each page in its own boundary: a crash is reported and the header and footer stay.
  // The loader sits inside the layout, so the header and footer stay while a page file loads.
  let element = <ErrorBoundary key={path}><Suspense fallback={<PageLoader />}><Component /></Suspense></ErrorBoundary>;

  if (isProtected) {
    element = <ProtectedRoute>{element}</ProtectedRoute>;
  }

  if (layout) {
    element = <Layout footer={footer !== false}>{element}</Layout>;
  }

  return <Route key={path} path={path} element={element} />;
}

export default function AppRouter() {
  const NotFound = notFoundRoute.component;
  useEffect(() => { prefetchLikelyPages(); }, []);

  return (
    <Suspense fallback={<PageLoader />}>
      <ScrollToTop />
      <Routes>
        {publicRoutes.map(({ path, component: Component }) => (
          <Route
            key={path}
            path={path}
            element={<PublicRoute><Component /></PublicRoute>}
          />
        ))}

        {routes.map(renderRoute)}

        <Route
          path={notFoundRoute.path}
          element={
            notFoundRoute.layout
              ? <Layout><NotFound /></Layout>
              : <NotFound />
          }
        />
      </Routes>
    </Suspense>
  );
}
