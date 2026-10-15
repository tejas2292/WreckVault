import { createContext, useCallback, useContext, useRef, useState } from 'react';
import Dialog from '../components/Dialog.jsx';

const ConfirmContext = createContext(async () => false);

// In-app confirm dialog. confirm({title, message, confirmLabel, cancelLabel, danger}) -> Promise<boolean>
export function ConfirmProvider({ children }) {
  const [req, setReq] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback((opts) => {
    return new Promise((resolve) => {
      if (resolver.current) resolver.current(false);
      resolver.current = resolve;
      setReq(opts);
    });
  }, []);

  const finish = (value) => {
    const r = resolver.current;
    resolver.current = null;
    setReq(null);
    r?.(value);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {req && (
        <Dialog
          title={req.title}
          size="sm"
          center
          onClose={() => finish(false)}
          footer={
            <>
              <button type="button" className="btn btn-sec" onClick={() => finish(false)}>
                {req.cancelLabel || 'Cancel'}
              </button>
              <button
                type="button"
                className={`btn ${req.danger ? 'btn-danger' : 'btn-pri'}`}
                onClick={() => finish(true)}
                data-autofocus={req.danger ? undefined : true}
              >
                {req.confirmLabel || 'Confirm'}
              </button>
            </>
          }
        >
          {typeof req.message === 'string' ? <p>{req.message}</p> : req.message}
        </Dialog>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}
