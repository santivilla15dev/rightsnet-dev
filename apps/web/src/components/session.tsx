'use client';
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { api, ApiError } from '@/lib/api';
import type { User } from '@/lib/types';
const Context = createContext<{
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  toast: (m: string) => void;
}>({ user: null, loading: true, refresh: async () => {}, toast: () => {} });
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [notice, setNotice] = useState('');
  const refresh = useCallback(async () => {
    try {
      setUser(await api<User>('me'));
    } catch (e) {
      setUser(null);
      if (!(e instanceof ApiError && e.status === 401))
        setNotice(e instanceof Error ? e.message : 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(''), 6000);
      return () => clearTimeout(timer);
    }
  }, [notice]);
  return (
    <Context.Provider value={{ user, loading, refresh, toast: setNotice }}>
      {children}
      {notice ? (
        <div className="toast" role="status">
          {notice}
          <button aria-label="Cerrar aviso" onClick={() => setNotice('')}>
            ×
          </button>
        </div>
      ) : null}
    </Context.Provider>
  );
}
export const useSession = () => useContext(Context);
