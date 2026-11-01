import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { resumeTarget, AFTER_SIGN_IN_PATH } from '../api';

export default function PublicRoute({ children }) {
  const { isAuthenticated } = useSelector((state) => state.auth);
  const location = useLocation();
  // Taken on the first render: by the time it is read the store says "signed in" either way,
  // and what differs is whether they already were when they opened the page.
  const [signedInOnArrival] = useState(isAuthenticated);

  if (!isAuthenticated) return children;

  // This redirect, not the sign-in page's own navigate(), decides where a fresh sign-in lands.
  // The store flips at once and re-renders this route while the router is still applying the
  // page's navigation in a transition; this <Navigate> fires after it and wins. Aimed at "/" it
  // threw away the checkout's booking (carried in `resume`) and sent a plain sign-in home
  // instead of to its bookings, so it aims exactly where useAuthSuccess was going.
  //
  // Only for a sign-in made HERE. Someone who arrives already signed in (the browser's Back onto
  // an old sign-in page, say) goes home as before: following that page's `resume` would put them
  // back into a checkout they may since have paid for.
  if (signedInOnArrival) return <Navigate to="/" replace />;
  const target = resumeTarget(location.state);
  if (target) return <Navigate to={target.path} state={target.state} replace />;
  return <Navigate to={AFTER_SIGN_IN_PATH} replace />;
}
