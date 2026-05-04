import { Routes, Route } from 'react-router-dom';
import { Suspense } from 'react';
import Layout from '../Layout/Layout';
import ProtectedRoute from '../components/ProtectedRoute';
import PublicRoute from '../components/PublicRoute';
import { routes, publicRoutes, notFoundRoute } from './routes.config';

function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ width: 36, height: 36, border: '3px solid #f5a51e', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function renderRoute({ path, component: Component, layout, protected: isProtected }) {
  let element = <Component />;

  if (isProtected) {
    element = <ProtectedRoute>{element}</ProtectedRoute>;
  }

  if (layout) {
    element = <Layout>{element}</Layout>;
  }

  return <Route key={path} path={path} element={element} />;
}

export default function AppRouter() {
  const NotFound = notFoundRoute.component;

  return (
    <Suspense fallback={<PageLoader />}>
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
