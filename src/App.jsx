import { BrowserRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import store from './store/index';
import AppRouter from './routes/AppRouter';
import { ToastProvider } from './context/ToastContext';
import ToastContainer from './components/Toast/ToastContainer';

export default function App() {
  return (
    <Provider store={store}>
      <ToastProvider>
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
        <ToastContainer />
      </ToastProvider>
    </Provider>
  );
}
