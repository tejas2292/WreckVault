import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const seq = useRef(0);

  const toast = useCallback((message, opts = {}) => {
    const id = ++seq.current;
    setToasts((list) => [...list.slice(-2), { id, message, tone: opts.tone || '' }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), opts.duration || (opts.tone === 'bad' ? 5000 : 3200));
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {createPortal(
        <div className="toasts" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.tone}`}>
              {t.message}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
