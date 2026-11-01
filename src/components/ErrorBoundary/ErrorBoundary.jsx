import { Component } from 'react';
import i18n from '../../i18n';
import { reportError } from '../../utils/errorReporter';

/**
 * A page that crashes while rendering is reported to our backend and shows a short message
 * with a reload button instead of a blank screen (go-live, 1 Nov 2026).
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    reportError(error, { kind: 'render' });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" style={{ maxWidth: 520, margin: '15vh auto', padding: '0 16px', textAlign: 'center' }}>
        <h2>{i18n.t('common:pageError.title', 'Something went wrong on this page')}</h2>
        <p>{i18n.t('common:pageError.text', 'Please reload the page. If you were paying, check your email before trying again, or contact our customer service.')}</p>
        <button type="button" onClick={() => window.location.reload()} style={{ marginTop: 12, padding: '10px 20px', borderRadius: 8, border: 0, background: '#f5a51e', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
          {i18n.t('common:pageError.reload', 'Reload page')}
        </button>
      </div>
    );
  }
}
