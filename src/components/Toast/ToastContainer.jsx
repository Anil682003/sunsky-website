import { useToast } from "../../context/ToastContext";
import styles from "./Toast.module.css";

function ToastItem({ id, message, type, onDismiss }) {
  const className = [
    styles.toast,
    type === "success" && styles.toastSuccess,
    type === "info" && styles.toastInfo,
    type === "error" && styles.toastError,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div role="alert" className={className} aria-live="polite">
      <p className={styles.message}>{message}</p>
      <button
        type="button"
        className={styles.dismiss}
        onClick={() => onDismiss(id)}
        aria-label="Dismiss"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className={styles.container} aria-label="Notifications">
      {toasts.map((t) => (
        <ToastItem
          key={t.id}
          id={t.id}
          message={t.message}
          type={t.type}
          onDismiss={removeToast}
        />
      ))}
    </div>
  );
}
