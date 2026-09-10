'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Loading } from './common';

/** Renders children only when GET /v1/config.demo_ui is true; else /login. */
export function DemoUiGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api<{ demo_ui?: boolean }>('config')
      .then((cfg) => {
        if (cancelled) return;
        if (!cfg.demo_ui) {
          router.replace('/login');
          return;
        }
        setAllowed(true);
      })
      .catch(() => {
        if (!cancelled) router.replace('/login');
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!allowed) return <Loading />;
  return children;
}
