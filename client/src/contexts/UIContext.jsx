import React, { createContext, useContext, useCallback } from 'react';
import Swal from 'sweetalert2';

const UIContext = createContext();

export const useUI = () => useContext(UIContext);

export const UIProvider = ({ children }) => {
  
  const showToast = useCallback((message, type = 'info') => {
    // Map internal types to SweetAlert types
    const icon = type === 'danger' ? 'error' : type;
    
    const Toast = Swal.mixin({
      toast: true,
      position: 'bottom-end',
      showConfirmButton: false,
      timer: 3000,
      timerProgressBar: true,
      background: 'var(--bg-card)',
      color: 'white',
      didOpen: (toast) => {
        toast.addEventListener('mouseenter', Swal.stopTimer);
        toast.addEventListener('mouseleave', Swal.resumeTimer);
      }
    });

    Toast.fire({
      icon: icon,
      title: message
    });
  }, []);

  const confirm = useCallback(async ({ title, message, type = 'neutral' }) => {
    const result = await Swal.fire({
      title: title,
      text: message,
      icon: type === 'danger' ? 'warning' : 'question',
      showCancelButton: true,
      confirmButtonColor: type === 'danger' ? 'var(--danger)' : 'var(--accent-primary)',
      cancelButtonColor: 'var(--text-secondary)',
      confirmButtonText: 'Yes, proceed',
      background: 'var(--bg-card)',
      color: 'white'
    });

    return result.isConfirmed;
  }, []);

  return (
    <UIContext.Provider value={{ showToast, confirm }}>
      {children}
    </UIContext.Provider>
  );
};
