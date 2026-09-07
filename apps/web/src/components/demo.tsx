'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  Building2,
  Leaf,
  Shield,
  Ban,
  ClipboardCheck,
  UserPlus,
  Eye,
} from 'lucide-react';
import { api } from '@/lib/api';
import { setDemoSession, clearDemoSession } from '@/lib/demo-session';
import { useSession } from './session';
import { Button } from './ui/button';
import { ErrorPanel, Loading } from './common';

type AuthMode = string;

export function Demo() {
  const { refresh, toast } = useSession(),
    router = useRouter(),
    search = useSearchParams(),
    [busy, setBusy] = useState(''),
    [authMode, setAuthMode] = useState<AuthMode | null>(null),
    [error, setError] = useState('');

  useEffect(() => {
    void api<{ auth?: string }>('config')
      .then((cfg) => setAuthMode(cfg.auth ?? 'sandbox'))
      .catch(() => setAuthMode('sandbox'));
  }, []);

  useEffect(() => {
    const flow = search.get('flow');
    if (flow === 'creator-onboarding' && authMode === 'sandbox') {
      void enter('new_creator', {
        scenario: 'creator-onboarding',
        personaName: 'Nuevo creador',
        role: 'creator',
      }, '/onboarding');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot deep link
  }, [authMode, search]);

  async function enter(
    role: string,
    meta: { scenario: string; personaName: string; orgName?: string; role: string },
    dest: string,
  ) {
    setBusy(meta.scenario);
    setError('');
    try {
      await api('auth/sandbox', { method: 'POST', body: { role } });
      setDemoSession(meta);
      await refresh();
      router.push(dest);
    } catch (e) {
      setError((e as Error).message);
      toast((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  if (authMode === null) return <Loading />;

  if (authMode !== 'sandbox') {
    return (
      <div className="login-page">
        <div className="login-wrap">
          <p className="login-brand">
            RightsNet<span>.</span>
          </p>
          <h1>Demo no disponible</h1>
          <p className="login-lead">
            El cambio de personas solo está activo cuando <code>AUTH_PROVIDER=sandbox</code>.
            Usa el inicio de sesión real.
          </p>
          <Button asChild>
            <Link href="/login">Ir a iniciar sesión</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page demo-page">
      <div className="login-wrap demo-wrap">
        <p className="login-demo-label">RIGHTSNET DEMO</p>
        <h1>Elige un escenario para explorar el producto</h1>
        <p className="login-lead">
          Esto no es un registro de cuenta. Entras como una persona de demostración para recorrer
          el flujo.
        </p>
        {error ? <ErrorPanel message={error} /> : null}

        <h2 className="demo-section-title">Flujos de marca</h2>
        <div className="login-grid demo-grid">
          <article className="login-card">
            <span className="login-icon">
              <Building2 size={28} />
            </span>
            <span className="eyebrow">ESCENARIO A</span>
            <h2>Marca → Licenciar creador permitido</h2>
            <p>Explora como Alex · Estudio Norte y compra una licencia ALLOW.</p>
            <div className="login-persona">
              Alex · Estudio Norte
              <span>Persona de demostración</span>
            </div>
            <Button
              className="full-width"
              disabled={!!busy}
              onClick={() =>
                void enter(
                  'buyer',
                  {
                    scenario: 'buyer-allow',
                    personaName: 'Alex',
                    orgName: 'Estudio Norte',
                    role: 'buyer',
                  },
                  '/discover',
                )
              }
            >
              {busy === 'buyer-allow' ? 'Entrando…' : 'Explorar como marca'}
              <ArrowRight size={16} />
            </Button>
          </article>

          <article className="login-card">
            <span className="login-icon">
              <ClipboardCheck size={28} />
            </span>
            <span className="eyebrow">ESCENARIO B</span>
            <h2>Marca → Pedir aprobación manual</h2>
            <p>
              Misma marca. Configura un uso que requiera aprobación del creador (REQUIRES_APPROVAL).
            </p>
            <Button
              className="full-width"
              disabled={!!busy}
              onClick={() =>
                void enter(
                  'buyer',
                  {
                    scenario: 'buyer-approval',
                    personaName: 'Alex',
                    orgName: 'Estudio Norte',
                    role: 'buyer',
                  },
                  '/discover',
                )
              }
            >
              {busy === 'buyer-approval' ? 'Entrando…' : 'Explorar aprobación manual'}
              <ArrowRight size={16} />
            </Button>
          </article>

          <article className="login-card">
            <span className="login-icon">
              <Ban size={28} />
            </span>
            <span className="eyebrow">ESCENARIO C</span>
            <h2>Marca → Campaña prohibida</h2>
            <p>
              Intenta un uso denegado (p. ej. política/politics) para ver el camino DENY del motor.
            </p>
            <Button
              className="full-width"
              disabled={!!busy}
              onClick={() =>
                void enter(
                  'buyer',
                  {
                    scenario: 'buyer-deny',
                    personaName: 'Alex',
                    orgName: 'Estudio Norte',
                    role: 'buyer',
                  },
                  '/discover',
                )
              }
            >
              {busy === 'buyer-deny' ? 'Entrando…' : 'Explorar camino DENY'}
              <ArrowRight size={16} />
            </Button>
          </article>
        </div>

        <h2 className="demo-section-title">Flujos de creador</h2>
        <div className="login-grid demo-grid">
          <article className="login-card">
            <span className="login-icon">
              <Leaf size={28} />
            </span>
            <span className="eyebrow">CREADOR EXISTENTE</span>
            <h2>Creador → Gestionar perfil</h2>
            <p>Lucía Martín: verificada y publicada. Dashboard de negocio.</p>
            <div className="login-persona">
              Lucía Martín
              <span>Persona de demostración</span>
            </div>
            <Button
              className="full-width"
              disabled={!!busy}
              onClick={() =>
                void enter(
                  'creator',
                  {
                    scenario: 'creator-existing',
                    personaName: 'Lucía Martín',
                    role: 'creator',
                  },
                  '/dashboard',
                )
              }
            >
              {busy === 'creator-existing' ? 'Entrando…' : 'Explorar como creador'}
              <ArrowRight size={16} />
            </Button>
          </article>

          <article className="login-card">
            <span className="login-icon">
              <UserPlus size={28} />
            </span>
            <span className="eyebrow">CREADOR NUEVO</span>
            <h2>Creador → Onboarding desde cero</h2>
            <p>Crea un creador de demo incompleto e inicia el alta paso a paso.</p>
            <Button
              className="full-width"
              disabled={!!busy}
              onClick={() =>
                void enter(
                  'new_creator',
                  {
                    scenario: 'creator-onboarding',
                    personaName: 'Nuevo creador',
                    role: 'creator',
                  },
                  '/onboarding',
                )
              }
            >
              {busy === 'creator-onboarding' ? 'Entrando…' : 'Iniciar onboarding de creador'}
              <ArrowRight size={16} />
            </Button>
          </article>
          <article className="login-card">
            <span className="login-icon">
              <Eye size={28} />
            </span>
            <span className="eyebrow">SOLO LECTURA</span>
            <h2>Viewer → Explorar sin comprar</h2>
            <p>Acceso de lectura para comprobar bloqueos de compra.</p>
            <Button
              className="full-width"
              disabled={!!busy}
              onClick={() =>
                void enter(
                  'viewer',
                  {
                    scenario: 'viewer',
                    personaName: 'Lector',
                    orgName: 'Estudio Norte',
                    role: 'viewer',
                  },
                  '/discover',
                )
              }
            >
              {busy === 'viewer' ? 'Entrando…' : 'Probar acceso de solo lectura'}
              <ArrowRight size={16} />
            </Button>
          </article>
        </div>

        <h2 className="demo-section-title">Interno</h2>
        <div className="login-grid demo-grid" style={{ gridTemplateColumns: '1fr' }}>
          <article className="login-card">
            <span className="login-icon">
              <Shield size={28} />
            </span>
            <span className="eyebrow">OPS</span>
            <h2>Admin → Consola Ops</h2>
            <p>Revisión de perfiles, órdenes e incidencias. Protegido por rol admin.</p>
            <Button
              className="full-width"
              disabled={!!busy}
              onClick={() =>
                void enter(
                  'admin',
                  {
                    scenario: 'ops',
                    personaName: 'Admin sandbox',
                    role: 'admin',
                  },
                  '/ops',
                )
              }
            >
              {busy === 'ops' ? 'Entrando…' : 'Abrir consola Ops'}
              <ArrowRight size={16} />
            </Button>
          </article>
        </div>

        <p className="login-demo-note">
          <Link href="/" className="login-help-link">
            Inicio
          </Link>
          {' · '}
          <Link href="/login" className="login-help-link">
            Iniciar sesión
          </Link>
          {' · '}
          <button
            type="button"
            className="login-help-link"
            style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0 }}
            onClick={() => {
              clearDemoSession();
              toast('Marcador de demo limpiado.');
            }}
          >
            Limpiar marcador demo
          </button>
        </p>
      </div>
    </div>
  );
}
