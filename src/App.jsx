import { BrowserRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import store from './store/index';
import AppRouter from './routes/AppRouter';
import { ToastProvider } from './context/ToastContext';
import ToastContainer from './components/Toast/ToastContainer';
import { ConsentProvider } from './context/ConsentContext';
import CookieBanner from './components/CookieBanner/CookieBanner';

export default function App() {
  return (
    <Provider store={store}>
      <ToastProvider>
        {/* Consent sits OUTSIDE the router: what a visitor has agreed to has nothing to do
            with which page they are on, and gated components exist above the route tree. */}
        <ConsentProvider>
          <BrowserRouter>
            {/* Inside the router because the notice links to the cookie policy with <Link>,
                which throws outside router context — and BEFORE <AppRouter /> so its two
                buttons come early in the tab order instead of after the whole page. It is
                position:fixed, so DOM order changes nothing visually. */}
            <CookieBanner />
            <AppRouter />
          </BrowserRouter>
        </ConsentProvider>
        <ToastContainer />
      </ToastProvider>
    </Provider>
  );
}
