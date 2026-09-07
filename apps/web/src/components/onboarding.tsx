'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Check } from 'lucide-react';
import { api, labels } from '@/lib/api';
import type { AnyPolicy, Asset, LegacyPolicy, RightsPolicy, RuleState } from '@/lib/types';
import { isLegacyPolicy, isRightsPolicy } from '@/lib/policy';
import {
  canAccessCreatorDashboard,
  getCreatorLifecycleState,
  getOnboardingProgress,
  creatorHomePath,
} from '@/lib/creator-lifecycle';
import { useSession } from './session';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { AuthRequired, Badge, ErrorPanel, Loading } from './common';

const STEPS = [
  { id: 'profile', label: 'Perfil' },
  { id: 'identity', label: 'Identidad' },
  { id: 'likeness', label: 'Likeness' },
  { id: 'rules', label: 'Derechos' },
  { id: 'pricing', label: 'Precio' },
  { id: 'consent', label: 'Consentimiento' },
  { id: 'review', label: 'Revisión' },
] as const;

type StepId = (typeof STEPS)[number]['id'];

const RULE_CYCLE: RuleState[] = ['ALLOW', 'REQUIRES_APPROVAL', 'DENY'];

export function Onboarding() {
  const { user, loading: sessionLoading, toast } = useSession(),
    router = useRouter(),
    search = useSearchParams(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(''),
    [assets, setAssets] = useState<Asset[]>([]),
    [policy, setPolicy] = useState<AnyPolicy | null>(null),
    [name, setName] = useState(''),
    [bio, setBio] = useState(''),
    [location, setLocation] = useState(''),
    [languages, setLanguages] = useState('es'),
    [gender, setGender] = useState('unspecified'),
    [ageBand, setAgeBand] = useState('25_34'),
    [consentChecked, setConsentChecked] = useState(false),
    [appConfig, setAppConfig] = useState<{ identity?: string }>({}),
    [step, setStep] = useState<StepId>('profile');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [profile, cfg] = await Promise.all([
        api<{ assets: Asset[]; default_policy: AnyPolicy }>('creator'),
        api<{ identity?: string }>('config').catch(() => ({})),
      ]);
      setAppConfig(cfg);
      setAssets(profile.assets);
      const first = profile.assets[0];
      if (first) {
        setName(first.display_name);
        setBio(first.bio);
        setLocation(first.location);
        setGender(first.gender ?? 'unspecified');
        setAgeBand(first.age_band ?? '25_34');
        setLanguages((first.languages ?? ['es']).join(', '));
        setPolicy(first.policy);
      } else {
        setPolicy(profile.default_policy);
      }
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
    const q = search.get('step');
    if (q && STEPS.some((s) => s.id === q)) setStep(q as StepId);
  }, [search]);

  const asset = assets[0] ?? null;
  const lifecycle = getCreatorLifecycleState({ asset });
  const progress = getOnboardingProgress({ asset });

  useEffect(() => {
    if (loading || sessionLoading || !user) return;
    if (canAccessCreatorDashboard(lifecycle)) {
      router.replace('/dashboard');
      return;
    }
    if (lifecycle === 'UNDER_REVIEW' || lifecycle === 'CHANGES_REQUIRED' || lifecycle === 'APPROVED') {
      router.replace('/application');
    }
  }, [loading, sessionLoading, user, lifecycle, router]);

  const nextIncomplete = useMemo(() => {
    if (!progress.profile) return 'profile';
    if (!progress.identity) return 'identity';
    if (!progress.likeness) return 'likeness';
    if (!progress.licensingRules) return 'rules';
    if (!progress.pricing) return 'pricing';
    if (!progress.consent) return 'consent';
    return 'review';
  }, [progress]);

  async function action(key: string, fn: () => Promise<unknown>, message: string) {
    setBusy(key);
    setError('');
    try {
      await fn();
      toast(message);
      await load();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy('');
    }
  }

  async function upload(file: File) {
    if (!asset) return;
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
        api('assets/' + asset.id + '/files', {
          method: 'POST',
          body: { base64: data, mime_type: file.type },
        }),
      'Evidencia de likeness guardada.',
    );
  }

  if (sessionLoading || loading) return <Loading />;
  if (!user) return <AuthRequired />;
  if (!policy) return <ErrorPanel message={error || 'No se pudo cargar la política.'} />;

  const p = policy;
  const stepIndex = STEPS.findIndex((s) => s.id === step);

  function goNext() {
    const i = STEPS.findIndex((s) => s.id === step);
    if (i < STEPS.length - 1) setStep(STEPS[i + 1].id);
  }

  function parseLanguages() {
    return languages
      .split(/[,;\s]+/)
      .map((x) => x.trim().toLowerCase())
      .filter((x) => x.length >= 2)
      .slice(0, 5);
  }

  return (
    <div className="onboarding-page">
      <p className="login-demo-label">ALTA DE CREADOR</p>
      <h1>Configura tu identidad licenciable</h1>
      <p className="login-lead">
        Siete pasos. Tras enviar, Ops revisa. El dashboard solo se abre cuando publicas tu perfil.
      </p>

      <div className="onboarding-progress" aria-label="Progreso del alta">
        <p className="onboarding-progress-label">
          Paso {stepIndex + 1} de 7 · {progress.completedCount}/{progress.total} completados
        </p>
        <div className="onboarding-bars" role="presentation">
          {STEPS.map((s, i) => {
            const done =
              (s.id === 'profile' && progress.profile) ||
              (s.id === 'identity' && progress.identity) ||
              (s.id === 'likeness' && progress.likeness) ||
              (s.id === 'rules' && progress.licensingRules) ||
              (s.id === 'pricing' && progress.pricing) ||
              (s.id === 'consent' && progress.consent) ||
              (s.id === 'review' && progress.review);
            return (
              <button
                key={s.id}
                type="button"
                className={
                  'onboarding-bar' + (done ? ' done' : '') + (s.id === step ? ' current' : '')
                }
                onClick={() => setStep(s.id)}
                title={s.label}
              >
                <span>{i + 1}</span>
              </button>
            );
          })}
        </div>
        <p className="muted">
          Siguiente: <strong>{STEPS.find((s) => s.id === nextIncomplete)?.label}</strong>
        </p>
      </div>

      {error ? <ErrorPanel message={error} /> : null}

      <nav className="onboarding-steps" aria-label="Pasos">
        {STEPS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={'onboarding-step-tab' + (s.id === step ? ' active' : '')}
            onClick={() => setStep(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <section className="panel onboarding-panel-main">
        {step === 'profile' ? (
          <>
            <h2>1. Perfil</h2>
            <p className="muted">Cuéntales a las marcas quién eres.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (asset) {
                  toast('Perfil ya creado. Continúa con identidad.');
                  goNext();
                  return;
                }
                const langs = parseLanguages();
                void action(
                  'save-profile',
                  () =>
                    api('creators', {
                      method: 'POST',
                      body: {
                        display_name: name,
                        bio,
                        location,
                        gender,
                        age_band: ageBand,
                        languages: langs.length ? langs : ['es'],
                        policy: p,
                      },
                    }),
                  'Perfil creado.',
                ).then((ok) => {
                  if (ok) goNext();
                });
              }}
            >
              <label>
                Nombre público
                <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
              </label>
              <label>
                Ciudad y país
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  required
                  minLength={2}
                />
              </label>
              <label>
                Idiomas (códigos, separados por coma)
                <Input
                  value={languages}
                  onChange={(e) => setLanguages(e.target.value)}
                  placeholder="es, en, de"
                />
              </label>
              <label>
                Categoría / género (descubrimiento)
                <select value={gender} onChange={(e) => setGender(e.target.value)}>
                  <option value="unspecified">Sin especificar</option>
                  <option value="female">Mujer</option>
                  <option value="male">Hombre</option>
                  <option value="non_binary">No binario</option>
                </select>
              </label>
              <label>
                Franja de edad (descubrimiento)
                <select value={ageBand} onChange={(e) => setAgeBand(e.target.value)}>
                  <option value="18_24">18–24</option>
                  <option value="25_34">25–34</option>
                  <option value="35_44">35–44</option>
                  <option value="45_plus">45+</option>
                </select>
              </label>
              <label>
                Sobre ti
                <textarea value={bio} onChange={(e) => setBio(e.target.value)} required rows={4} />
              </label>
              <Button disabled={!!busy} type="submit">
                {busy ? 'Guardando…' : 'Guardar y continuar'}
                <ArrowRight size={16} />
              </Button>
            </form>
          </>
        ) : null}

        {step === 'identity' ? (
          <>
            <h2>2. Identidad</h2>
            <p className="muted">
              RightsNet exige demostrar que eres la persona cuya likeness se licencia.
            </p>
            {!asset ? (
              <p>Primero crea tu perfil.</p>
            ) : (
              <>
                {asset.identity_status === 'verified' ? (
                  <p className="onboarding-verified">
                    <Check size={18} /> Identidad verificada ✓
                  </p>
                ) : (
                  <p>
                    Estado: <Badge value={asset.identity_status} />
                  </p>
                )}
                {asset.identity_status !== 'verified' ? (
                  <Button
                    disabled={!!busy}
                    onClick={() =>
                      void action(
                        'identity',
                        async () => {
                          if (appConfig.identity === 'stripe') {
                            const s = await api<{ url?: string }>('creators/me/identity-session', {
                              method: 'POST',
                              body: {},
                            });
                            if (s.url) window.location.href = s.url;
                          } else {
                            await api('assets/' + asset.id + '/identity-sandbox', {
                              method: 'POST',
                              body: {},
                            });
                          }
                        },
                        'Verificación de identidad iniciada.',
                      ).then((ok) => {
                        if (ok) goNext();
                      })
                    }
                  >
                    {appConfig.identity === 'stripe'
                      ? 'Verificar identidad'
                      : 'Verificar identidad (simular)'}
                  </Button>
                ) : (
                  <Button onClick={goNext}>
                    Continuar
                    <ArrowRight size={16} />
                  </Button>
                )}
              </>
            )}
          </>
        ) : null}

        {step === 'likeness' ? (
          <>
            <h2>3. Likeness</h2>
            <p className="muted">
              Sube fotos de referencia claras. Ayudan a verificar qué licenciamos. Sin voz; vídeo más
              adelante.
            </p>
            {!asset ? (
              <p>Primero crea tu perfil.</p>
            ) : (
              <>
                <p>
                  Fotos: {(asset.files?.length ?? 0) > 0 ? <Check size={16} /> : null}{' '}
                  {asset.files?.length ?? 0}
                </p>
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  aria-label="Subir evidencia"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(f);
                  }}
                />
                <Button style={{ marginTop: 12 }} onClick={goNext} disabled={!progress.likeness}>
                  Continuar
                  <ArrowRight size={16} />
                </Button>
              </>
            )}
          </>
        ) : null}

        {step === 'rules' ? (
          <>
            <h2>4. Derechos</h2>
            <p className="muted">Controla cómo la IA puede usar tu likeness.</p>
            {!asset ? (
              <p>Primero crea tu perfil.</p>
            ) : isLegacyPolicy(p) ? (
              <LegacyRulesEditor
                policy={p}
                onChange={setPolicy}
                busy={!!busy}
                onSave={() =>
                  void action(
                    'rules',
                    () => api('assets/' + asset.id + '/policies', { method: 'POST', body: p }),
                    'Derechos guardados.',
                  ).then((ok) => {
                    if (ok) goNext();
                  })
                }
              />
            ) : isRightsPolicy(p) ? (
              <RightsCoreEditor
                policy={p}
                onChange={setPolicy}
                busy={!!busy}
                onSave={() =>
                  void action(
                    'rules',
                    () => api('assets/' + asset.id + '/policies', { method: 'POST', body: p }),
                    'Derechos guardados.',
                  ).then((ok) => {
                    if (ok) goNext();
                  })
                }
              />
            ) : null}
          </>
        ) : null}

        {step === 'pricing' ? (
          <>
            <h2>5. Precio</h2>
            <p className="muted">Define el precio base de tu licencia de 30 días.</p>
            {!asset ? (
              <p>Completa el perfil primero.</p>
            ) : isRightsPolicy(p) ? (
              <div>
                <label>
                  Licencia base 30 días (€)
                  <Input
                    type="number"
                    min={10}
                    step={1}
                    value={(p.pricing.duration_prices_minor['30'] ?? 0) / 100}
                    onChange={(e) =>
                      setPolicy({
                        ...p,
                        pricing: {
                          ...p.pricing,
                          duration_prices_minor: {
                            ...p.pricing.duration_prices_minor,
                            '30': Math.round(Number(e.target.value) * 100),
                          },
                        },
                      })
                    }
                  />
                </label>
                <label>
                  Opcional · 90 días (€)
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={(p.pricing.duration_prices_minor['90'] ?? 0) / 100}
                    onChange={(e) =>
                      setPolicy({
                        ...p,
                        pricing: {
                          ...p.pricing,
                          duration_prices_minor: {
                            ...p.pricing.duration_prices_minor,
                            '90': Math.round(Number(e.target.value) * 100),
                          },
                        },
                      })
                    }
                  />
                </label>
                <Button
                  disabled={!!busy}
                  onClick={() =>
                    void action(
                      'price',
                      () => api('assets/' + asset.id + '/policies', { method: 'POST', body: p }),
                      'Precio guardado.',
                    ).then((ok) => {
                      if (ok) goNext();
                    })
                  }
                >
                  Continuar
                  <ArrowRight size={16} />
                </Button>
              </div>
            ) : isLegacyPolicy(p) ? (
              <div>
                <label>
                  Precio 30 días (€)
                  <Input
                    type="number"
                    value={p.prices['30'] / 100}
                    onChange={(e) =>
                      setPolicy({
                        ...p,
                        prices: {
                          ...p.prices,
                          '30': Math.round(Number(e.target.value) * 100),
                        },
                      })
                    }
                  />
                </label>
                <label>
                  Precio 90 días (€)
                  <Input
                    type="number"
                    value={p.prices['90'] / 100}
                    onChange={(e) =>
                      setPolicy({
                        ...p,
                        prices: {
                          ...p.prices,
                          '90': Math.round(Number(e.target.value) * 100),
                        },
                      })
                    }
                  />
                </label>
                <Button
                  disabled={!!busy}
                  onClick={() =>
                    void action(
                      'price',
                      () => api('assets/' + asset.id + '/policies', { method: 'POST', body: p }),
                      'Precio guardado.',
                    ).then((ok) => {
                      if (ok) goNext();
                    })
                  }
                >
                  Guardar y continuar
                </Button>
              </div>
            ) : null}
          </>
        ) : null}

        {step === 'consent' ? (
          <>
            <h2>6. Consentimiento</h2>
            {!asset ? (
              <p>Completa los pasos anteriores.</p>
            ) : asset.consented ? (
              <>
                <p>
                  <Check size={16} /> Consentimiento registrado (política v{asset.policy_version}).
                </p>
                <Button onClick={goNext}>Continuar</Button>
              </>
            ) : (
              <>
                <div className="consent-review-copy">
                  <p>
                    Autorizas a RightsNet a ofrecer licencias según las reglas que configuraste.
                  </p>
                  <p>Sigues al control de tu política de licencia.</p>
                  <p>RightsNet no puede licenciar usos que hayas prohibido explícitamente.</p>
                </div>
                <label className="consent-check">
                  <input
                    type="checkbox"
                    checked={consentChecked}
                    onChange={(e) => setConsentChecked(e.target.checked)}
                  />
                  Entiendo y acepto.
                </label>
                <Button
                  disabled={!!busy || !consentChecked}
                  onClick={() =>
                    void action(
                      'consent',
                      () =>
                        api('assets/' + asset.id + '/consent', {
                          method: 'POST',
                          body: { accepted: true, document_hash: asset.policy_hash },
                        }),
                      'Consentimiento registrado.',
                    ).then((ok) => {
                      if (ok) goNext();
                    })
                  }
                >
                  Aceptar y continuar
                  <ArrowRight size={16} />
                </Button>
              </>
            )}
          </>
        ) : null}

        {step === 'review' ? (
          <>
            <h2>7. Revisión</h2>
            <p className="muted">Listo para revisión</p>
            <ul className="onboarding-review-list">
              {(
                [
                  ['Perfil', progress.profile],
                  ['Identidad', progress.identity],
                  ['Likeness', progress.likeness],
                  ['Política de derechos', progress.licensingRules],
                  ['Precio', progress.pricing],
                  ['Consentimiento', progress.consent],
                ] as const
              ).map(([label, ok]) => (
                <li key={label}>
                  <strong>{label}</strong>
                  <span>{ok ? '✓' : 'Pendiente'}</span>
                </li>
              ))}
            </ul>
            <Button
              disabled={!!busy || !progress.review || !asset}
              onClick={() =>
                void action(
                  'submit',
                  () => api('assets/' + asset!.id + '/submit', { method: 'POST', body: {} }),
                  'Enviado a revisión.',
                ).then(() => router.push('/application'))
              }
            >
              {busy === 'submit' ? 'Enviando…' : 'Enviar a revisión'}
            </Button>
            {!progress.review ? (
              <p className="muted">Completa todos los pasos antes de enviar.</p>
            ) : null}
          </>
        ) : null}
      </section>

      <p className="login-demo-note">
        Paso {stepIndex + 1} de {STEPS.length}
        {' · '}
        <Link href="/help" className="login-help-link">
          Guía
        </Link>
        {' · '}
        {lifecycle} → {creatorHomePath(lifecycle)}
      </p>
    </div>
  );
}

function RightsCoreEditor({
  policy,
  onChange,
  busy,
  onSave,
}: {
  policy: RightsPolicy;
  onChange: (p: AnyPolicy) => void;
  busy: boolean;
  onSave: () => void;
}) {
  function setRule(
    group: 'industries' | 'territories' | 'channels' | 'operations' | 'purpose',
    key: string,
    value: RuleState,
  ) {
    const map = { ...policy[group], [key]: value };
    onChange({ ...policy, [group]: map });
  }

  function cycle(group: 'industries' | 'operations' | 'purpose', key: string) {
    const cur = (policy[group] as Record<string, RuleState>)[key] ?? 'DENY';
    const i = RULE_CYCLE.indexOf(cur);
    const next = RULE_CYCLE[(i + 1) % RULE_CYCLE.length];
    setRule(group, key, next);
  }

  function toggleAllow(group: 'territories' | 'channels', key: string) {
    const cur = policy[group][key];
    setRule(group, key, cur === 'ALLOW' ? 'DENY' : 'ALLOW');
  }

  const industries = [
    'beauty',
    'fashion',
    'lifestyle',
    'alcohol',
    'gambling',
    'political_advertising',
  ] as const;
  const operations = [
    ['synthetic_video', 'Vídeo IA'],
    ['synthetic_image', 'Imagen IA'],
  ] as const;

  return (
    <div className="rights-onboarding-editor">
      <h3>Uso de IA</h3>
      {operations.map(([key, label]) => (
        <div key={key} className="onboarding-rule-row">
          <strong>{label}</strong>
          <Badge value={policy.operations[key] ?? 'DENY'} />
          <Button type="button" size="sm" variant="outline" onClick={() => cycle('operations', key)}>
            Cambiar
          </Button>
        </div>
      ))}
      <div className="onboarding-rule-row">
        <strong>Publicidad comercial</strong>
        <Badge value={policy.purpose.commercial_advertising ?? 'DENY'} />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => cycle('purpose', 'commercial_advertising')}
        >
          Cambiar
        </Button>
      </div>

      <h3>Industrias</h3>
      {industries.map((c) => (
        <div key={c} className="onboarding-rule-row">
          <strong>{labels[c] ?? c}</strong>
          <Badge value={policy.industries[c] ?? 'DENY'} />
          <Button type="button" size="sm" variant="outline" onClick={() => cycle('industries', c)}>
            Cambiar
          </Button>
        </div>
      ))}

      <h3>Territorios</h3>
      {(
        [
          ['AT', 'Austria'],
          ['DE', 'Alemania'],
        ] as const
      ).map(([c, l]) => (
        <div key={c} className="onboarding-rule-row">
          <strong>{l}</strong>
          <Badge value={policy.territories[c] ?? 'DENY'} />
          <Button type="button" size="sm" variant="outline" onClick={() => toggleAllow('territories', c)}>
            {policy.territories[c] === 'ALLOW' ? 'Quitar' : 'Permitir'}
          </Button>
        </div>
      ))}

      <h3>Canales</h3>
      {(['instagram', 'tiktok', 'youtube'] as const).map((c) => (
        <div key={c} className="onboarding-rule-row">
          <strong>{c}</strong>
          <Badge value={policy.channels[c] ?? 'DENY'} />
          <Button type="button" size="sm" variant="outline" onClick={() => toggleAllow('channels', c)}>
            {policy.channels[c] === 'ALLOW' ? 'Quitar' : 'Permitir'}
          </Button>
        </div>
      ))}

      <label>
        Modo de aprobación
        <select
          value={policy.approval_mode}
          onChange={(e) =>
            onChange({
              ...policy,
              approval_mode: e.target.value as 'AUTOMATIC' | 'MANUAL',
            })
          }
        >
          <option value="AUTOMATIC">Automática (ALLOW directo)</option>
          <option value="MANUAL">Manual (el creador aprueba)</option>
        </select>
      </label>

      <Button disabled={busy} onClick={onSave} style={{ marginTop: 16 }}>
        Guardar derechos y continuar
        <ArrowRight size={16} />
      </Button>
    </div>
  );
}

function LegacyRulesEditor({
  policy,
  onChange,
  busy,
  onSave,
}: {
  policy: LegacyPolicy;
  onChange: (p: AnyPolicy) => void;
  busy: boolean;
  onSave: () => void;
}) {
  const cats = ['beauty', 'lifestyle', 'fashion', 'politics', 'alcohol'];
  function toggle(field: 'categories' | 'denied_categories', v: string) {
    const next = { ...policy };
    if (field === 'categories') {
      next.categories = next.categories.includes(v)
        ? next.categories.filter((x) => x !== v)
        : [...next.categories, v];
      next.denied_categories = next.denied_categories.filter((x) => x !== v);
    } else {
      next.denied_categories = next.denied_categories.includes(v)
        ? next.denied_categories.filter((x) => x !== v)
        : [...next.denied_categories, v];
      next.categories = next.categories.filter((x) => x !== v);
    }
    onChange(next);
  }
  return (
    <div>
      <p>Estados por categoría (política legacy).</p>
      {cats.map((c) => {
        const allow = policy.categories.includes(c);
        const deny = policy.denied_categories.includes(c);
        const state = allow ? 'ALLOW' : deny ? 'DENY' : 'NOT_SPECIFIED';
        return (
          <div key={c} className="onboarding-rule-row">
            <strong>{c}</strong>
            <Badge value={state} />
            <Button type="button" variant="outline" size="sm" onClick={() => toggle('categories', c)}>
              ALLOW
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => toggle('denied_categories', c)}>
              DENY
            </Button>
          </div>
        );
      })}
      <Button disabled={busy} onClick={onSave} style={{ marginTop: 16 }}>
        Guardar reglas y continuar
      </Button>
    </div>
  );
}
