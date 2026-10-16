import {createContext, useContext} from 'react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastContextType {
  /** `detail` is an optional second, quieter line. */
  showSuccess: (message: string, detail?: string) => void;
  showError: (message: string, detail?: string) => void;
  showInfo: (message: string, detail?: string) => void;
}

export const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
