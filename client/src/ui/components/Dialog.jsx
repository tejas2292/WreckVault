import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import Icon from './Icon.jsx';
import { isTopDialog, popDialog, pushDialog } from '../lib/dialogStack.js';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Modal dialog: traps focus, closes on Escape and on a scrim click, restores focus on close.
// On phones the CSS turns it into a bottom sheet.
export default function Dialog({
  title,
  icon,
  onClose,
  children,
  footer,
  size = '',
  className = '',
  bare = false,
  center = false,
  ariaLabel,
  as: Tag = 'div',
  onSubmit,
}) {
  const ref = useRef(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const token = pushDialog();
    const previous = document.activeElement;
    const node = ref.current;
    const first = node.querySelector('[data-autofocus]') || node.querySelector('.dlg-b ' + FOCUSABLE) || node.querySelector(FOCUSABLE);
    (first || node).focus({ preventScroll: true });

    const onKey = (e) => {
      if (!isTopDialog(token)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = [...node.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!list.length) {
        e.preventDefault();
        return;
      }
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      if (e.shiftKey && (document.activeElement === firstEl || !node.contains(document.activeElement))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && (document.activeElement === lastEl || !node.contains(document.activeElement))) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      popDialog(token);
      document.body.style.overflow = overflow;
      if (previous && typeof previous.focus === 'function' && document.contains(previous)) {
        previous.focus({ preventScroll: true });
      }
    };
  }, []);

  const onScrim = (e) => {
    if (e.target === e.currentTarget) onCloseRef.current?.();
  };

  return createPortal(
    <div className={`scrim ${center ? 'center' : ''}`} onMouseDown={onScrim}>
      <Tag
        ref={ref}
        className={`dlg ${size} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : ariaLabel}
        tabIndex={-1}
        onSubmit={onSubmit}
        noValidate={Tag === 'form' ? true : undefined}
      >
        {bare ? (
          children
        ) : (
          <>
            {title && (
              <div className="dlg-h">
                {icon}
                <h2 id={titleId}>{title}</h2>
                <button type="button" className="ib" onClick={() => onCloseRef.current?.()} aria-label="Close">
                  <Icon icon={X} />
                </button>
              </div>
            )}
            <div className="dlg-b">{children}</div>
            {footer && <div className="dlg-f">{footer}</div>}
          </>
        )}
      </Tag>
    </div>,
    document.body,
  );
}
