'use client';
import { useEffect, useState, useCallback } from 'react';
import {
  Check,
  ShieldCheck,
  FileCheck2,
  Wallet,
  ArrowUpRight,
  Upload,
  Save,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, money, labels, date } from '@/lib/api';
import type { Asset, RightsPolicy, AnyPolicy, LicenseRequest, Order, ConnectStatus } from '@/lib/types';
import { isLegacyPolicy, isRightsPolicy } from '@/lib/policy';
import {
  canAccessCreatorDashboard,
  creatorHomePath,
  getCreatorLifecycleState,
} from '@/lib/creator-lifecycle';
import { useSession } from './session';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Title, Badge, Loading, ErrorPanel, AuthRequired, SandboxNote } from './common';
type MoneySummary = {
  paid_minor: number;
  transferred_minor: number;
  payout_minor: number;
};
type AppConfig = {
  identity?: 'sandbox' | 'stripe';
  rights_core_purchases?: boolean;
};
export function CreatorDashboard() {
  const { user, loading: sessionLoading, toast } = useSession(),
    router = useRouter(),
    [assets, setAssets] = useState<Asset[]>([]),
    [policy, setPolicy] = useState<AnyPolicy | null>(null),
    [appConfig, setAppConfig] = useState<AppConfig>({}),
    [requests, setRequests] = useState<LicenseRequest[]>([]),
    [orders, setOrders] = useState<Order[]>([]),
    [connect, setConnect] = useState<ConnectStatus | null>(null),
    [moneySummary, setMoneySummary] = useState<MoneySummary | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(''),
    [loading, setLoading] = useState(true),
    [name, setName] = useState(''),
    [bio, setBio] = useState(''),
    [location, setLocation] = useState(''),
    [consentChecked, setConsentChecked] = useState(false);
  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [profile, r, o, cfg] = await Promise.all([
        api<{
          assets: Asset[];
          default_policy: AnyPolicy;
          connect: ConnectStatus | null;
          money: MoneySummary | null;
        }>('creator'),
        api<LicenseRequest[]>('license-requests'),
        api<Order[]>('orders'),
        api<AppConfig>('config').catch((): AppConfig => ({})),
      ]);
      setAppConfig(cfg);
      setAssets(profile.assets);
      const first = profile.assets[0]?.policy;
      if (first && isRightsPolicy(first)) {
        setPolicy(first);
      } else if (cfg.rights_core_purchases && !first) {
        setPolicy(profile.default_policy);
      } else {
        setPolicy(first && isLegacyPolicy(first) ? first : profile.default_policy);
      }
      setConnect(profile.connect);
      setMoneySummary(profile.money);
      setRequests(r);
      setOrders(o);
      setConsentChecked(false);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [user]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const connectParam = params.get('connect');
    const identityParam = params.get('identity');
    if (connectParam === 'return' || connectParam === 'refresh') {
      void (async () => {
        await load();
        if (connectParam === 'refresh') {
          toast('El enlace de Stripe caducó. Genera uno nuevo para continuar.');
        } else {
          toast('Volviste de Stripe. Revisamos el estado de cobros en vivo.');
        }
      })();
      window.history.replaceState({}, '', '/dashboard');
    }
    if (identityParam === 'return') {
      void (async () => {
        await load();
        toast('Volviste de la verificación de identidad. El estado se actualiza con el webhook.');
      })();
      window.history.replaceState({}, '', '/dashboard');
    }
  }, [load, toast]);
  useEffect(() => {
    if (sessionLoading || loading || !user) return;
    if (!user.has_creator && user.role !== 'creator' && user.role !== 'admin') return;
    const a0 = assets[0] ?? null;
    const state = getCreatorLifecycleState({ asset: a0 });
    if (!canAccessCreatorDashboard(state)) {
      router.replace(creatorHomePath(state));
    }
  }, [sessionLoading, loading, user, assets, router]);

  if (sessionLoading) return <Loading />;
  if (!user) return <AuthRequired />;
  if (!user.has_creator && user.role !== 'creator' && user.role !== 'admin') {
    return (
      <ErrorPanel message="El espacio del creador requiere un perfil. Empieza en el onboarding." />
    );
  }
  if (loading) return <Loading />;
  if (!policy) return <ErrorPanel message={error} />;
  const p = policy,
    a = assets[0],
    editingRights = isRightsPolicy(p);
  const pendingRequests = requests.filter((r) => r.decision === 'REQUIRES_APPROVAL');
  const decidedRequests = requests.filter((r) => r.decision !== 'REQUIRES_APPROVAL');
  const recentSold = orders
    .filter((o) => o.license_id || o.status === 'fulfilled')
    .slice(0, 6);
  if (
    (user.has_creator || user.role === 'creator') &&
    !canAccessCreatorDashboard(getCreatorLifecycleState({ asset: a ?? null }))
  )
    return <Loading />;
  async function action(key: string, fn: () => Promise<unknown>, message: string) {
    setBusy(key);
    setError('');
    try {
      await fn();
      toast(message);
      await load();
    } catch (e) {
      const err = e as Error & { code?: string };
      setError(err.message);
      if (err.code === 'CONNECT_PLATFORM_REQUIRED') {
        toast(err.message);
      }
    } finally {
      setBusy('');
    }
  }
  function toggleLegacy(field: 'categories' | 'territories' | 'channels', v: string) {
    setPolicy((current) => {
      if (!current || !isLegacyPolicy(current)) return current;
      return {
        ...current,
        [field]: current[field].includes(v)
          ? current[field].filter((x) => x !== v)
          : [...current[field], v],
      };
    });
  }
  function toggleRule(
    group: 'industries' | 'territories' | 'channels' | 'operations' | 'durations',
    key: string,
  ) {
    setPolicy((current) => {
      if (!current || !isRightsPolicy(current)) return current;
      const map = { ...current[group] } as Record<string, string>;
      const next = map[key] === 'ALLOW' ? 'DENY' : 'ALLOW';
      // Soft industries stay DENY when toggled off; prohibited stay DENY.
      if (['gambling', 'tobacco', 'political_advertising', 'adult'].includes(key) && group === 'industries') {
        map[key] = 'DENY';
      } else {
        map[key] = next === 'ALLOW' ? 'ALLOW' : group === 'industries' && ['beauty', 'lifestyle', 'fashion'].includes(key)
          ? 'NOT_SPECIFIED'
          : 'DENY';
      }
      return { ...current, [group]: map } as RightsPolicy;
    });
  }
  async function upload(file: File) {
    if (file.size > 2097152) {
      toast('La imagen debe pesar como máximo 2 MB.');
      return;
    }
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    await action(
      'upload',
      () =>
        api('assets/' + a.id + '/files', {
          method: 'POST',
          body: { base64: data, mime_type: file.type },
        }),
      'Evidencia guardada para revisión de prueba.',
    );
  }
  return (
    <>
      <Title
        eyebrow="ESPACIO DEL CREADOR"
        title="Tu identidad. Tus reglas."
        description="Controla cómo se utiliza tu imagen y participa en cada decisión."
        action={
          a?.status === 'published' ? (
            <Button variant="outline" asChild>
              <Link href={'/creators/' + a.id}>
                Ver mi perfil
                <ArrowUpRight size={16} />
              </Link>
            </Button>
          ) : undefined
        }
      />
      <div className="stats-grid" id="overview">
        <div className="stat">
          <span>
            <Wallet size={18} />
            Pagado (órdenes)
          </span>
          <b>
            {money(
              moneySummary?.paid_minor ??
                orders
                  .filter((o) => ['fulfilled', 'paid', 'issuing'].includes(o.status))
                  .reduce((s, o) => s + o.price.creator_minor, 0),
            )}
          </b>
          <small>Bruto creador en órdenes confirmadas</small>
        </div>
        <div className="stat">
          <span>
            <Wallet size={18} />
            Transferido (Stripe)
          </span>
          <b>{money(moneySummary?.transferred_minor ?? 0)}</b>
          <small>Saldo en cuenta conectada, no es payout bancario</small>
        </div>
        <div className="stat">
          <span>
            <Wallet size={18} />
            Payout bancario
          </span>
          <b>{money(moneySummary?.payout_minor ?? 0)}</b>
          <small>Retiros agregados; no se imputan a una orden</small>
        </div>
        <div className="stat">
          <span>
            <FileCheck2 size={18} />
            Licencias
          </span>
          <b>{orders.filter((o) => o.license_id).length}</b>
          <small>Emitidas con tus condiciones</small>
        </div>
      </div>

      {pendingRequests.length || recentSold.length ? (
        <section className="dashboard-feed" aria-label="Actividad reciente">
          {pendingRequests.map((r) => (
            <article className="request-card" key={r.id}>
              <p className="request-card-eyebrow">Nueva solicitud</p>
              <h3>{r.usage.campaign_name}</h3>
              <p className="request-card-org">{r.legal_name}</p>
              <dl className="request-card-meta">
                <div>
                  <dt>Uso</dt>
                  <dd>
                    {labels[r.usage.industry ?? r.usage.category ?? ''] ??
                      r.usage.industry ??
                      r.usage.category ??
                      '—'}
                    {' · '}
                    {labels[r.usage.generation_type ?? r.usage.operation ?? ''] ??
                      r.usage.generation_type ??
                      r.usage.operation ??
                      '—'}
                  </dd>
                </div>
                <div>
                  <dt>Territorio / canales</dt>
                  <dd>
                    {(r.usage.territories ?? []).join(', ') || '—'} ·{' '}
                    {(r.usage.channels ?? []).join(', ') || '—'}
                  </dd>
                </div>
                <div>
                  <dt>Duración</dt>
                  <dd>{r.usage.duration_days} días</dd>
                </div>
              </dl>
              <details className="request-why">
                <summary>¿Por qué me lo piden?</summary>
                <p>
                  La marca necesita tu aprobación porque tu política exige revisión manual para este
                  uso
                  {r.reason_codes?.length
                    ? ` (${r.reason_codes.map((c) => labels[c] ?? c).join(', ')})`
                    : ''}
                  .
                </p>
                <p className="muted small">
                  Campaña «{r.usage.campaign_name}» · recibida {date(r.created_at)}.
                </p>
              </details>
              <div className="inline-actions">
                <Button
                  size="sm"
                  disabled={!!busy}
                  onClick={() =>
                    void action(
                      r.id,
                      () =>
                        api('license-requests/' + r.id + '/decision', {
                          method: 'POST',
                          body: { decision: 'approve', usage_hash: r.usage_hash },
                        }),
                      'Solicitud aprobada. La marca puede completar la licencia.',
                    )
                  }
                >
                  Aprobar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!!busy}
                  onClick={() =>
                    void action(
                      r.id,
                      () =>
                        api('license-requests/' + r.id + '/decision', {
                          method: 'POST',
                          body: { decision: 'reject', usage_hash: r.usage_hash },
                        }),
                      'Solicitud rechazada.',
                    )
                  }
                >
                  Rechazar
                </Button>
              </div>
            </article>
          ))}
          {recentSold.map((o) => (
            <article className="sold-card" key={o.id}>
              <p className="request-card-eyebrow">Nueva licencia vendida</p>
              <h3>{o.scope.campaign_name}</h3>
              <p className="request-card-org">{o.organization_legal_name ?? 'Marca'}</p>
              <dl className="request-card-meta">
                <div>
                  <dt>Tu neto</dt>
                  <dd>
                    <b>{money(o.price.creator_minor)}</b>
                  </dd>
                </div>
                <div>
                  <dt>Total orden</dt>
                  <dd>{money(o.price.total_minor)}</dd>
                </div>
                <div>
                  <dt>Token</dt>
                  <dd>
                    {o.public_token ? (
                      <Link href={'/verify/' + o.public_token}>
                        <code>{o.public_token}</code>
                      </Link>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
              </dl>
              <p className="muted small">{date(o.created_at)}</p>
            </article>
          ))}
        </section>
      ) : null}

      {error ? <ErrorPanel message={error} /> : null}
      <div className="dashboard-layout">
        <section className="panel" id="rules">
          <div className="panel-header">
            <ShieldCheck size={22} />
            <h2>{a ? 'Configura tus derechos' : 'Crea tu perfil'}</h2>
            {a ? <Badge value={a.status} /> : null}
          </div>
          {editingRights ? (
            <p className="muted">
              Editor <code>rightsnet.rights-policy/0.1</code> (piloto AT/DE). Activa lo que
              permites. No reescribe políticas ES legacy.
            </p>
          ) : null}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action(
                'save',
                () =>
                  a
                    ? api('assets/' + a.id + '/policies', { method: 'POST', body: p })
                    : api('creators', {
                        method: 'POST',
                        body: { display_name: name, bio, location, policy: p },
                      }),
                a
                  ? 'Nueva versión guardada. Revisa y acepta la política para publicarla.'
                  : 'Perfil creado. Completa los pasos de verificación.',
              );
            }}
          >
            {!a ? (
              <>
                <label>
                  Nombre público
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    minLength={2}
                    maxLength={60}
                  />
                </label>
                <label>
                  Ciudad y país
                  <Input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    required
                    minLength={2}
                    maxLength={80}
                  />
                </label>
                <label>
                  Sobre ti
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    required
                    minLength={20}
                    maxLength={600}
                  />
                </label>
              </>
            ) : null}
            {editingRights && isRightsPolicy(p) ? (
              <>
                <fieldset>
                  <legend>Industrias permitidas</legend>
                  <div className="check-pills">
                    {(['beauty', 'lifestyle', 'fashion'] as const).map((c) => (
                      <label key={c} className={p.industries[c] === 'ALLOW' ? 'checked' : ''}>
                        <input
                          type="checkbox"
                          checked={p.industries[c] === 'ALLOW'}
                          onChange={() => toggleRule('industries', c)}
                        />
                        {labels[c] ?? c}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>Territorios (AT / DE)</legend>
                  <div className="check-pills">
                    {(
                      [
                        ['AT', 'Austria'],
                        ['DE', 'Alemania'],
                      ] as const
                    ).map(([c, l]) => (
                      <label key={c} className={p.territories[c] === 'ALLOW' ? 'checked' : ''}>
                        <input
                          type="checkbox"
                          checked={p.territories[c] === 'ALLOW'}
                          onChange={() => toggleRule('territories', c)}
                        />
                        {l}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>Canales</legend>
                  <div className="check-pills">
                    {(['instagram', 'tiktok', 'youtube'] as const).map((c) => (
                      <label key={c} className={p.channels[c] === 'ALLOW' ? 'checked' : ''}>
                        <input
                          type="checkbox"
                          checked={p.channels[c] === 'ALLOW'}
                          onChange={() => toggleRule('channels', c)}
                        />
                        {c}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>Operaciones</legend>
                  <div className="check-pills">
                    {(['synthetic_image', 'synthetic_video'] as const).map((c) => (
                      <label key={c} className={p.operations[c] === 'ALLOW' ? 'checked' : ''}>
                        <input
                          type="checkbox"
                          checked={p.operations[c] === 'ALLOW'}
                          onChange={() => toggleRule('operations', c)}
                        />
                        {c === 'synthetic_image' ? 'Imagen sintética' : 'Vídeo sintético'}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>Duraciones</legend>
                  <div className="check-pills">
                    {(['30', '90'] as const).map((c) => (
                      <label key={c} className={p.durations[c] === 'ALLOW' ? 'checked' : ''}>
                        <input
                          type="checkbox"
                          checked={p.durations[c] === 'ALLOW'}
                          onChange={() => toggleRule('durations', c)}
                        />
                        {c} días
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="form-grid">
                  <label>
                    Precio / 30 días (€)
                    <Input
                      type="number"
                      min={10}
                      max={100000}
                      step={1}
                      value={(p.pricing.duration_prices_minor['30'] ?? 0) / 100}
                      onChange={(e) => {
                        const euros = Number(e.target.value);
                        setPolicy((cur) => {
                          if (!cur || !isRightsPolicy(cur)) return cur;
                          return {
                            ...cur,
                            pricing: {
                              ...cur.pricing,
                              duration_prices_minor: {
                                ...cur.pricing.duration_prices_minor,
                                '30': Math.round(euros * 100),
                              },
                            },
                          };
                        });
                      }}
                      required
                    />
                  </label>
                  <label>
                    Precio / 90 días (€)
                    <Input
                      type="number"
                      min={10}
                      max={100000}
                      step={1}
                      value={(p.pricing.duration_prices_minor['90'] ?? 0) / 100}
                      onChange={(e) => {
                        const euros = Number(e.target.value);
                        setPolicy((cur) => {
                          if (!cur || !isRightsPolicy(cur)) return cur;
                          return {
                            ...cur,
                            pricing: {
                              ...cur.pricing,
                              duration_prices_minor: {
                                ...cur.pricing.duration_prices_minor,
                                '90': Math.round(euros * 100),
                              },
                            },
                          };
                        });
                      }}
                      required
                    />
                  </label>
                </div>
                <label>
                  Aprobación de campañas
                  <select
                    value={p.approval_mode}
                    onChange={(e) =>
                      setPolicy((cur) =>
                        cur && isRightsPolicy(cur)
                          ? {
                              ...cur,
                              approval_mode: e.target.value as 'AUTOMATIC' | 'MANUAL',
                            }
                          : cur,
                      )
                    }
                  >
                    <option value="AUTOMATIC">Automática, si cumple mis reglas</option>
                    <option value="MANUAL">Revisar cada solicitud personalmente</option>
                  </select>
                </label>
              </>
            ) : isLegacyPolicy(p) ? (
              <>
                <fieldset>
                  <legend>Categorías permitidas</legend>
                  <div className="check-pills">
                    {['beauty', 'lifestyle', 'fashion'].map((c) => (
                      <label key={c} className={p.categories.includes(c) ? 'checked' : ''}>
                        <input
                          type="checkbox"
                          checked={p.categories.includes(c)}
                          onChange={() => toggleLegacy('categories', c)}
                        />
                        {labels[c]}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>Territorios</legend>
                  <div className="check-pills">
                    {[
                      ['ES', 'España'],
                      ['DE', 'Alemania'],
                    ].map(([c, l]) => (
                      <label key={c} className={p.territories.includes(c) ? 'checked' : ''}>
                        <input
                          type="checkbox"
                          checked={p.territories.includes(c)}
                          onChange={() => toggleLegacy('territories', c)}
                        />
                        {l}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>Canales</legend>
                  <div className="check-pills">
                    {['instagram', 'tiktok', 'youtube'].map((c) => (
                      <label key={c} className={p.channels.includes(c) ? 'checked' : ''}>
                        <input
                          type="checkbox"
                          checked={p.channels.includes(c)}
                          onChange={() => toggleLegacy('channels', c)}
                        />
                        {c}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="form-grid">
                  <label>
                    Precio / 30 días (€)
                    <Input
                      type="number"
                      min={10}
                      max={100000}
                      step={1}
                      value={p.prices['30'] / 100}
                      onChange={(e) =>
                        setPolicy({
                          ...p,
                          prices: { ...p.prices, '30': Number(e.target.value) * 100 },
                        })
                      }
                      required
                    />
                  </label>
                  <label>
                    Precio / 90 días (€)
                    <Input
                      type="number"
                      min={10}
                      max={100000}
                      step={1}
                      value={p.prices['90'] / 100}
                      onChange={(e) =>
                        setPolicy({
                          ...p,
                          prices: { ...p.prices, '90': Number(e.target.value) * 100 },
                        })
                      }
                      required
                    />
                  </label>
                </div>
                <label>
                  Aprobación de campañas
                  <select
                    value={p.approval}
                    onChange={(e) =>
                      setPolicy({ ...p, approval: e.target.value as 'manual' | 'automatic' })
                    }
                  >
                    <option value="automatic">Automática, si cumple mis reglas</option>
                    <option value="manual">Revisar cada solicitud personalmente</option>
                  </select>
                </label>
              </>
            ) : null}
            <div className="policy-prohibitions">
              <ShieldCheck size={18} />
              <p>
                Siempre fuera: voz, entrenamiento, sublicencias, política, adultos, apuestas, tabaco
                y alcohol.
              </p>
            </div>
            <Button
              type="submit"
              disabled={
                !!busy ||
                (isLegacyPolicy(p)
                  ? !p.categories.length || !p.territories.length || !p.channels.length
                  : isRightsPolicy(p)
                    ? !Object.values(p.territories).includes('ALLOW') ||
                      !Object.values(p.channels).includes('ALLOW')
                    : true)
              }
              onClick={(e) => {
                e.preventDefault();
                void action(
                  'save',
                  () =>
                    a
                      ? api('assets/' + a.id + '/policies', { method: 'POST', body: p })
                      : api('creators', {
                          method: 'POST',
                          body: { display_name: name, bio, location, policy: p },
                        }),
                  a
                    ? 'Nueva versión guardada. Revisa y acepta la política para publicarla.'
                    : 'Perfil creado. Completa los pasos de verificación.',
                );
              }}
            >
              <Save size={16} />
              {busy === 'save' ? 'Guardando…' : a ? 'Guardar nueva versión' : 'Crear mi perfil'}
            </Button>
          </form>
        </section>
        <aside className="panel onboarding-panel" id="likeness">
          <span className="eyebrow">RIGHTS PASSPORT</span>
          <h2>De tu perfil al permiso.</h2>
          <p className="muted">Completa cada paso para publicar tu likeness.</p>
          {a ? (
            <>
              <div className="onboarding-step">
                <span className={a.identity_status === 'verified' ? 'step-done' : 'step-number'}>
                  {a.identity_status === 'verified' ? <Check size={16} /> : '1'}
                </span>
                <div>
                  <h3>Identidad y mayoría de edad</h3>
                  <p>
                    {appConfig.identity === 'stripe'
                      ? 'Stripe Identity (test): documento oficial + selfie de coincidencia. RightsNet no guarda esas fotos.'
                      : 'Comprobación simulada en este sandbox (no es KYC real).'}
                  </p>
                  {a.identity_status !== 'verified' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!!busy}
                      onClick={() =>
                        void action(
                          'identity',
                          async () => {
                            const session = await api<{
                              status: string;
                              url: string | null;
                              sandbox?: boolean;
                            }>('creators/me/identity-session', {
                              method: 'POST',
                              body: { asset_id: a.id },
                            });
                            if (session.url) {
                              window.location.href = session.url;
                              return session;
                            }
                            return session;
                          },
                          appConfig.identity === 'stripe'
                            ? 'Te enviamos a Stripe Identity (documento + selfie).'
                            : 'Verificación de identidad simulada. No es un KYC real.',
                        )
                      }
                    >
                      {appConfig.identity === 'stripe'
                        ? 'Verificar con documento y selfie'
                        : 'Simular verificación'}
                    </Button>
                  ) : (
                    <Badge value="verified" />
                  )}
                </div>
              </div>
              <div className="onboarding-step">
                <span
                  className={a.relationship_status === 'reviewed' ? 'step-done' : 'step-number'}
                >
                  {a.relationship_status === 'reviewed' ? <Check size={16} /> : '2'}
                </span>
                <div>
                  <h3>Vínculo con tu likeness</h3>
                  <p>Sube únicamente una imagen de prueba. PNG o JPEG, máximo 2 MB.</p>
                  {['draft', 'rejected'].includes(a.status) ? (
                    <label className="upload-button">
                      <Upload size={15} />
                      {busy === 'upload' ? 'Subiendo…' : 'Añadir evidencia'}
                      <input
                        aria-label="Subir evidencia"
                        type="file"
                        accept="image/png,image/jpeg"
                        disabled={!!busy}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void upload(f);
                        }}
                      />
                    </label>
                  ) : null}
                  {a.files?.map((f) => (
                    <small className="file-row" key={f.id}>
                      Imagen ·{' '}
                      {f.scan_status === 'clean'
                        ? 'revisada'
                        : f.scan_status === 'rejected'
                          ? 'rechazada'
                          : 'pendiente'}
                    </small>
                  ))}
                  <Badge value={a.relationship_status} />
                </div>
              </div>
              <div className="onboarding-step">
                <span className={a.consented ? 'step-done' : 'step-number'}>
                  {a.consented ? <Check size={16} /> : '3'}
                </span>
                <div>
                  <h3>Consentimiento de la política v{a.policy_version}</h3>
                  <p>La aceptación se guarda con la versión y el hash de tus condiciones.</p>
                  {!a.consented ? (
                    <>
                      <label className="acceptance">
                        <input
                          type="checkbox"
                          checked={consentChecked}
                          onChange={(e) => setConsentChecked(e.target.checked)}
                        />
                        <span>Acepto las condiciones guardadas para esta prueba de likeness.</span>
                      </label>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!busy || !consentChecked}
                        onClick={() =>
                          void action(
                            'consent',
                            () =>
                              api('assets/' + a.id + '/consent', {
                                method: 'POST',
                                body: { accepted: true, document_hash: a.policy_hash },
                              }),
                            'Consentimiento registrado para esta versión.',
                          )
                        }
                      >
                        Registrar consentimiento
                      </Button>
                    </>
                  ) : (
                    <Badge value="ALLOW" />
                  )}
                </div>
              </div>
              <div className="onboarding-step">
                <span
                  className={
                    connect?.payouts_ready || connect?.transfers_status === 'simulated'
                      ? 'step-done'
                      : 'step-number'
                  }
                >
                  {connect?.payouts_ready || connect?.transfers_status === 'simulated' ? (
                    <Check size={16} />
                  ) : (
                    '4'
                  )}
                </span>
                <div>
                  <h3>Cobros y liquidación</h3>
                  {connect?.provider === 'sandbox' ? (
                    <>
                      <p>
                        En sandbox los cobros son simulados. La verificación de identidad ya deja un
                        destino de prueba.
                      </p>
                      <Badge
                        value={
                          connect.transfers_status === 'simulated' ? 'verified' : 'draft'
                        }
                      />
                    </>
                  ) : (
                    <>
                      <p>
                        Completa Stripe Connect (modo test) para recibir destination charges. El
                        estado de transfers y requisitos se consulta en vivo a Stripe; el enlace de
                        onboarding no se guarda.
                      </p>
                      {error &&
                      (error.includes('plataforma Connect') ||
                        error.includes('platform setup') ||
                        error.includes('CONNECT_PLATFORM')) ? (
                        <div className="panel" role="alert">
                          <p>
                            <b>Falta el alta de plataforma en Stripe.</b> Elige el modelo marketplace
                            (Cliente → Tú → Destinatario) y completa platform setup.
                          </p>
                          {connect?.platform_setup_url ? (
                            <Button size="sm" variant="outline" asChild>
                              <a
                                href={connect.platform_setup_url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Abrir platform setup (test)
                                <ArrowUpRight size={14} />
                              </a>
                            </Button>
                          ) : (
                            <a
                              className="text-link"
                              href="https://dashboard.stripe.com/test/settings/connect/platform-setup"
                              target="_blank"
                              rel="noreferrer"
                            >
                              Abrir platform setup (test)
                            </a>
                          )}
                        </div>
                      ) : null}
                      <div className="connect-status-grid">
                        <small className="file-row">
                          Transferencias:{' '}
                          <b>{connect?.transfers_status ?? 'desconocido'}</b>
                          {connect?.stripe_account_id
                            ? ' · ' + connect.stripe_account_id.slice(0, 14) + '…'
                            : ' · sin cuenta aún'}
                        </small>
                        <small className="file-row">
                          Requisitos:{' '}
                          <b>
                            {connect?.requirements_status ??
                              (connect?.requirements_due ? 'pendientes' : 'al día')}
                          </b>
                          {connect?.onboarding_complete ? ' · onboarding completo' : ''}
                        </small>
                        <small className="file-row">
                          Listo para recibir:{' '}
                          <b>{connect?.payouts_ready ? 'sí' : 'aún no'}</b>
                        </small>
                      </div>
                      {connect?.requirements_due && !connect?.payouts_ready ? (
                        <p className="muted">
                          Stripe pide datos adicionales o remediación. Abre de nuevo el formulario
                          alojado.
                        </p>
                      ) : null}
                      {connect?.can_start_onboarding ? (
                        <Button
                          size="sm"
                          disabled={!!busy}
                          onClick={() =>
                            void action(
                              'connect',
                              async () => {
                                const link = await api<{ url: string }>(
                                  'creator/connect/onboarding-link',
                                  { method: 'POST', body: {} },
                                );
                                window.location.assign(link.url);
                              },
                              'Redirigiendo a Stripe…',
                            )
                          }
                        >
                          {connect.transfers_status === 'unrequested' || !connect.stripe_account_id
                            ? 'Configurar cobros con Stripe'
                            : 'Completar requisitos en Stripe'}
                        </Button>
                      ) : connect?.payouts_ready ? (
                        <Badge value="verified" />
                      ) : null}
                    </>
                  )}
                </div>
              </div>
              <div className="publish-actions">
                {a.relationship_status === 'reviewed' ? (
                  <Button
                    className="full-width"
                    disabled={
                      !!busy || !a.consented || a.status === 'published' || a.status === 'suspended'
                    }
                    onClick={() =>
                      void action(
                        'publish',
                        () => api('assets/' + a.id + '/publish', { method: 'POST', body: {} }),
                        'Tu perfil ya está publicado.',
                      )
                    }
                  >
                    Publicar perfil
                    <ArrowRight size={16} />
                  </Button>
                ) : (
                  <Button
                    className="full-width"
                    disabled={!!busy || !a.consented || a.status === 'pending_review'}
                    onClick={() =>
                      void action(
                        'submit',
                        () => api('assets/' + a.id + '/submit', { method: 'POST', body: {} }),
                        'Enviado a administración para revisión.',
                      )
                    }
                  >
                    Enviar a revisión
                    <ArrowRight size={16} />
                  </Button>
                )}
              </div>
            </>
          ) : (
            <p className="muted">Primero guarda tu perfil y sus condiciones.</p>
          )}
        </aside>
      </div>
      <div className="section-heading spaced" id="requests">
        <div>
          <span className="section-number">02 /</span>
          <h2>Solicitudes de marcas</h2>
        </div>
      </div>
      {pendingRequests.length ? (
        <p className="muted">
          Tienes {pendingRequests.length} solicitud
          {pendingRequests.length === 1 ? '' : 'es'} pendiente
          {pendingRequests.length === 1 ? '' : 's'} arriba. Revisa y decide.
        </p>
      ) : null}
      {decidedRequests.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Campaña</th>
                <th>Uso</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {decidedRequests.map((r) => (
                <tr key={r.id}>
                  <td>
                    <b>{r.usage.campaign_name}</b>
                    <small>{r.legal_name}</small>
                  </td>
                  <td>
                    {(r.usage.territories ?? []).join(', ')} · {r.usage.duration_days} días
                    <small>
                      {(r.usage.channels ?? []).join(', ')}
                      {r.usage.industry || r.usage.category
                        ? ` · ${r.usage.industry ?? r.usage.category}`
                        : ''}
                    </small>
                  </td>
                  <td>
                    <Badge value={r.decision} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !pendingRequests.length ? (
        <p className="muted">Tus próximas colaboraciones aparecerán aquí.</p>
      ) : null}

      <div className="section-heading spaced" id="licenses">
        <div>
          <span className="section-number">03 /</span>
          <h2>Licencias emitidas</h2>
        </div>
      </div>
      {recentSold.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Campaña</th>
                <th>Marca</th>
                <th>Tu neto</th>
                <th>Token</th>
              </tr>
            </thead>
            <tbody>
              {orders
                .filter((o) => o.license_id || o.status === 'fulfilled')
                .map((o) => (
                  <tr key={o.id}>
                    <td>
                      <b>{o.scope.campaign_name}</b>
                      <small>{date(o.created_at)}</small>
                    </td>
                    <td>{o.organization_legal_name ?? '—'}</td>
                    <td>{money(o.price.creator_minor)}</td>
                    <td>
                      {o.public_token ? (
                        <Link href={'/verify/' + o.public_token}>
                          <code>{o.public_token}</code>
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">Cuando una marca pague, verás aquí la licencia firmada y tu neto.</p>
      )}

      <div className="section-heading spaced" id="earnings">
        <div>
          <span className="section-number">04 /</span>
          <h2>Ingresos</h2>
        </div>
      </div>
      <div className="stats-grid earnings-detail">
        <div className="stat">
          <span>Pagado</span>
          <b>
            {money(
              moneySummary?.paid_minor ??
                orders
                  .filter((o) => ['fulfilled', 'paid', 'issuing'].includes(o.status))
                  .reduce((s, o) => s + o.price.creator_minor, 0),
            )}
          </b>
        </div>
        <div className="stat">
          <span>Transferido</span>
          <b>{money(moneySummary?.transferred_minor ?? 0)}</b>
        </div>
        <div className="stat">
          <span>Payout</span>
          <b>{money(moneySummary?.payout_minor ?? 0)}</b>
        </div>
      </div>

      <section className="panel stub-panel" id="usage">
        <h2>Uso</h2>
        <p className="muted">
          Próximamente: verás cómo las marcas usan tu likeness con contenido vinculado a cada
          licencia. Stub del MVP.
        </p>
      </section>

      <section className="panel stub-panel" id="settings">
        <h2>Ajustes</h2>
        <p className="muted">
          Próximamente: notificaciones, datos de cobro y preferencias de cuenta. Stub del MVP.
        </p>
      </section>

      <SandboxNote />
    </>
  );
}
