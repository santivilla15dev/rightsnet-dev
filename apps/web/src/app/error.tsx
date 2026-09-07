'use client';
import { ErrorPanel } from '@/components/common';
export default function Error({ reset }: { reset: () => void }) {
  return (
    <ErrorPanel
      message="Ha ocurrido un error inesperado. Tu información guardada sigue en el servidor."
      retry={reset}
    />
  );
}
