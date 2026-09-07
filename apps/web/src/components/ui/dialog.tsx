'use client';
import { useEffect, useRef, type ReactNode } from 'react';
export function Dialog({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="action-dialog native-dialog"
      onCancel={onClose}
      aria-labelledby="action-title"
    >
      {children}
    </dialog>
  );
}
