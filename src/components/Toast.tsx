import React, {useCallback, useState} from 'react';
import { createPortal } from 'react-dom';
import {ToastContext, type ToastType} from './ToastContext';
import './Toast.css';

interface Toast {
  id: string;
  message: string;
  detail?: string;
  type: ToastType;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((message: string, type: ToastType, detail?: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, detail, type }]);

    // Success and info hide on their own; an error stays until dismissed.
    if (type !== 'error') {
      setTimeout(() => removeToast(id), 5000);
    }
  }, [removeToast]);

  const showSuccess = useCallback((message: string, detail?: string) => addToast(message, 'success', detail), [addToast]);
  const showError = useCallback((message: string, detail?: string) => addToast(message, 'error', detail), [addToast]);
  const showInfo = useCallback((message: string, detail?: string) => addToast(message, 'info', detail), [addToast]);

  return (
    <ToastContext.Provider value={{ showSuccess, showError, showInfo }}>
      {children}
      {createPortal(
        <div className="toast-container" role="status" aria-live="polite">
          {toasts.map(toast => (
            <div key={toast.id} className={`toast toast-${toast.type}`}>
              <span className="toast-dot" aria-hidden="true"/>
              <div className="toast-text">
                <span className="toast-message">{toast.message}</span>
                {toast.detail && <span className="toast-detail">{toast.detail}</span>}
              </div>
              <button className="toast-close" onClick={() => removeToast(toast.id)} aria-label="Dismiss">
                ×
              </button>
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}
