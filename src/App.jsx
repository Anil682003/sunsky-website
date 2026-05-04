import { BrowserRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import store from './store/index';
import { ToastProvider } from './context/ToastContext';
import AppRouter from './routes/AppRouter';

export default function App() {
  return (
    <Provider store={store}>
      <BrowserRouter>
        <ToastProvider>
          <AppRouter />
        </ToastProvider>
      </BrowserRouter>
    </Provider>
  );
}
