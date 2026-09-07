'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check } from 'lucide-react';
import { api } from '@/lib/api';
import type { Asset } from '@/lib/types';
import {
  canAccessCreatorDashboard,
  getCreatorLifecycleState,
  getOnboardingProgress,
} from '@/lib/creator-lifecycle';
import { useSession } from './session';
import { Button } from './ui/button';
import { AuthRequired, Badge, ErrorPanel, Loading } from './common';

export function Application() {
  const { user, loading: sessionLoading, toast } = useSession(),
    router = useRouter(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [asset, setAsset] = useState<Asset | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const profile = await api<{ assets: Asset[] }>('creator');
      const a = profile.assets[0] ?? null;
      setAsset(a);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void load();
    else if (!sessionLoading) setLoading(false);
  }, [user, sessionLoading, load]);

  useEffect(() => {
    if (loading || sessionLoading || !user || !asset) return;
    const state = getCreatorLifecycleState({ asset });
    if (canAccessCreatorDashboard(state)) router.replace('/dashboard');
    else if (
      state === 'DRAFT' ||
      state === 'IDENTITY_PENDING' ||
      state === 'SETUP_INCOMPLETE' ||
      state === 'READY_FOR_REVIEW'
    )
      router.replace('/onboarding');
  }, [loading, sessionLoading, user, asset, router]);

  async function publishProfile() {
    if (!asset) return;
    setBusy(true);
    setError('');
    try {
      await api('assets/' + asset.id + '/publish', { method: 'POST', body: {} });
      toast('Perfil publicado. Ya estás en el marketplace.');
      router.push('/dashboard');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (sessionLoading || loading) return <Loading />;
  if (!user) return <AuthRequired />;
  if (!user.has_creator && user.role !== 'creator') {
    return <ErrorPanel message="Aún no tienes perfil de creador. Empieza en el onboarding." />;
  }
  if (error && !asset) return <ErrorPanel message={error} />;
  if (!asset) return <Loading />;

  const state = getCreatorLifecycleState({ asset });
  const progress = getOnboardingProgress({ asset });

  if (state === 'APPROVED') {
    return (
      <div className="onboarding-page">
        <p className="login-demo-label">APROBADO</p>
        <h1>
          Estás aprobado <Check size={28} style={{ display: 'inline', verticalAlign: 'middle' }} />
        </h1>
        <p className="login-lead">Tu Rights Passport está listo. Revisa todo antes de aparecer en público.</p>
        <section className="panel" style={{ padding: '1.25rem' }}>
          <p>
            Estado: <Badge value="APPROVED" /> — aún no publicado
          </p>
          {error ? (
            <p role="alert" className="inline-error">
              {error}
            </p>
          ) : null}
          <Button className="full-width" disabled={busy} onClick={() => void publishProfile()}>
            {busy ? 'Publicando…' : 'Publicar mi perfil'}
            <ArrowRight size={16} />
          </Button>
        </section>
        <p className="login-demo-note">
          <Link href="/help" className="login-help-link">
            Guía
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="onboarding-page">
      <p className="login-demo-label">SOLICITUD DE PERFIL</p>
      <h1>
        {state === 'CHANGES_REQUIRED' ? 'Se requieren cambios' : 'Solicitud enviada'}
      </h1>
      <p className="login-lead">
        {state === 'CHANGES_REQUIRED'
          ? 'Corrige lo indicado y vuelve a enviar desde el onboarding.'
          : 'Estamos revisando tu perfil de creador. Ops revisará identidad, likeness y política.'}
      </p>

      <section className="panel" style={{ padding: '1.25rem' }}>
        <ul className="onboarding-review-list">
          <li>
            <strong>Identidad</strong>
            <span>{progress.identity ? 'Verificada ✓' : asset.identity_status}</span>
          </li>
          <li>
            <strong>Likeness</strong>
            <span>{progress.likeness ? 'Enviado ✓' : 'Pendiente'}</span>
          </li>
          <li>
            <strong>Política de derechos</strong>
            <span>{progress.licensingRules ? 'Completa ✓' : 'Pendiente'}</span>
          </li>
          <li>
            <strong>Estado</strong>
            <span>
              <Badge value={state === 'UNDER_REVIEW' ? 'UNDER_REVIEW' : state} />
            </span>
          </li>
        </ul>
        {state === 'CHANGES_REQUIRED' ? (
          <Button asChild>
            <Link href="/onboarding">
              Volver al onboarding
              <ArrowRight size={16} />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" onClick={() => void load()}>
            Actualizar estado
          </Button>
        )}
      </section>
      <p className="login-demo-note">
        <Link href="/" className="login-help-link">
          Inicio
        </Link>
        {' · '}
        <Link href="/help" className="login-help-link">
          Guía
        </Link>
      </p>
    </div>
  );
}
