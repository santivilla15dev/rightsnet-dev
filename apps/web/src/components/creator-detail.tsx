'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  X,
  ShieldCheck,
  Globe2,
  FileCheck2,
  ChevronDown,
  LockKeyhole,
} from 'lucide-react';
import { api, money, labels } from '@/lib/api';
import type { Asset } from '@/lib/types';
import {
  allowedList,
  allowedOperations,
  allowsCommercialAds,
  deniedSummary,
  isRightsPolicy,
  policyApproval,
  policyPrice,
} from '@/lib/policy';
import { useSession } from './session';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge, ErrorPanel, Loading, SandboxNote } from './common';
import { canPurchaseLicense } from '@/lib/creator-lifecycle';
import { stashLicenseDraft, takeLicenseDraft } from '@/lib/license-draft';

function reasonText(code: string) {
  const map: Record<string, string> = {
    CATEGORY_DENIED: 'Esta categoría está denegada por la política del creador.',
    INDUSTRY_PROHIBITED: 'Esta industria está prohibida por la política del creador.',
    TERRITORY_DENIED: 'Este territorio no está permitido.',
    CHANNEL_DENIED: 'Este canal no está permitido.',
    OPERATION_DENIED: 'Este tipo de generación no está permitido.',
    APPROVAL_REQUIRED: 'El creador debe aprobar esta campaña manualmente.',
  };
  return map[code] ?? code.replaceAll('_', ' ');
}

export function CreatorDetail({ id }: { id: string }) {
  const [asset, setAsset] = useState<Asset | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [checkoutBusy, setCheckoutBusy] = useState(false),
    [configuring, setConfiguring] = useState(false),
    [duration, setDuration] = useState<30 | 90>(30),
    [category, setCategory] = useState('beauty'),
    [territories, setTerritories] = useState<string[]>([]),
    [channels, setChannels] = useState<string[]>(['instagram']),
    [operation, setOperation] = useState('synthetic_image'),
    [campaign, setCampaign] = useState(''),
    [start, setStart] = useState(new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)),
    [result, setResult] = useState<{
      id?: string;
      preview?: boolean;
      decision: string;
      reason_codes: string[];
      missing_fields?: string[];
    } | null>(null),
    [passport, setPassport] = useState(false),
    [passportJson, setPassportJson] = useState<unknown>(null),
    [pendingAction, setPendingAction] = useState<'continue' | 'request_approval' | null>(null);
  const configRef = useRef<HTMLElement | null>(null);
  const { user, toast } = useSession(),
    router = useRouter();

  useEffect(() => {
    api<Asset>('assets/' + id)
      .then((a) => {
        setAsset(a);
        const draft = takeLicenseDraft();
        const cats = allowedList(a.policy, 'categories');
        const terr = allowedList(a.policy, 'territories');
        const ch = allowedList(a.policy, 'channels');
        const ops = allowedList(a.policy, 'operations');
        if (draft && draft.assetId === a.id) {
          setConfiguring(true);
          setCampaign(draft.campaign);
          setCategory(draft.category);
          setTerritories(draft.territories);
          setChannels(draft.channels);
          setDuration(draft.duration);
          setStart(draft.start);
          setOperation(draft.operation);
          if (draft.action) setPendingAction(draft.action);
        } else {
          setCategory(cats[0] ?? 'beauty');
          setTerritories(terr.length ? [terr[0]] : []);
          setChannels(ch.length ? [ch[0]] : ['instagram']);
          setOperation(ops[0] ?? 'synthetic_image');
        }
      })
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (!passport || !asset) return;
    api('assets/' + asset.id + '/passport')
      .then(setPassportJson)
      .catch(() => setPassportJson({ error: 'passport_unavailable' }));
  }, [passport, asset]);

  // After login/setup, resume Continuar / Solicitar aprobación
  useEffect(() => {
    if (!asset || !user || !pendingAction) return;
    const purchase = canPurchaseLicense(user);
    if (!purchase.ok) return;
    const action = pendingAction;
    setPendingAction(null);
    void (async () => {
      setBusy(true);
      try {
        const body = (() => {
          const rightsPolicy = isRightsPolicy(asset.policy);
          if (rightsPolicy) {
            return {
              organization_id: user.organizations[0].id,
              asset_id: asset.id,
              request: {
                campaign_name: campaign,
                purpose: 'commercial_advertising' as const,
                industry: category,
                generation_type: operation,
                territories,
                channels,
                duration_days: duration,
                starts_at: start + 'T12:00:00.000Z',
                commercial_use: true as const,
                exclusivity: 'none' as const,
                requested_additional_rights: [] as [],
              },
            };
          }
          return {
            organization_id: user.organizations[0].id,
            asset_id: asset.id,
            usage: {
              campaign_name: campaign,
              operation,
              purpose: 'commercial_advertising',
              category,
              territories,
              channels,
              duration_days: duration,
              starts_at: start + 'T12:00:00Z',
              exclusivity: 'none',
              sublicensing: false,
              training: false,
              voice_clone: false,
            },
          };
        })();
        const r = await api<{
          id: string;
          decision: string;
          reason_codes: string[];
          missing_fields?: string[];
        }>('license-requests', { method: 'POST', body });
        setResult(r);
        if (action === 'continue' && r.decision === 'ALLOW') {
          const q = await api<{ id: string }>('quotes', {
            method: 'POST',
            body: { request_id: r.id },
          });
          const o = await api<{ id: string }>('orders', { method: 'POST', body: { quote_id: q.id } });
          router.push('/company/orders/' + o.id);
        } else if (action === 'request_approval' && r.decision === 'REQUIRES_APPROVAL') {
          toast('Solicitud enviada. Puedes seguirla en Mis campañas.');
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    })();
  }, [asset, user, pendingAction]);

  if (!asset) return error ? <ErrorPanel message={error} /> : <Loading />;
  const a = asset;
  const pathId = a.public_slug || a.id;
  const rights = isRightsPolicy(a.policy);
  const approval = policyApproval(a.policy);
  const fromPrice = policyPrice(a.policy, 30);
  const priceMinor = policyPrice(a.policy, duration);
  const niches = allowedList(a.policy, 'categories');
  const nicheLabel = niches[0] ? (labels[niches[0]] ?? niches[0]) : 'Lifestyle';
  const ops = allowedOperations(a.policy);
  const territoryOptions = rights
    ? [
        ['AT', 'Austria'],
        ['DE', 'Alemania'],
      ]
    : [
        ['ES', 'España'],
        ['DE', 'Alemania'],
      ];
  const categoryOptions = rights
    ? allowedList(a.policy, 'categories')
        .concat(['alcohol', 'gambling'])
        .filter((v, i, arr) => arr.indexOf(v) === i)
    : ['beauty', 'lifestyle', 'fashion', 'politics', 'alcohol'];

  function startConfiguring() {
    setConfiguring(true);
    requestAnimationFrame(() => {
      configRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function currentDraft(action?: 'continue' | 'request_approval') {
    return {
      assetPath: pathId,
      assetId: a.id,
      campaign,
      operation,
      category,
      territories,
      channels,
      duration,
      start,
      rights,
      action,
    };
  }

  function intentBody(organizationId: string) {
    return rights
      ? {
          organization_id: organizationId,
          asset_id: a.id,
          request: {
            campaign_name: campaign,
            purpose: 'commercial_advertising',
            industry: category,
            generation_type: operation,
            territories,
            channels,
            duration_days: duration,
            starts_at: start + 'T12:00:00.000Z',
            commercial_use: true,
            exclusivity: 'none',
            requested_additional_rights: [],
          },
        }
      : {
          organization_id: organizationId,
          asset_id: a.id,
          usage: {
            campaign_name: campaign,
            operation,
            purpose: 'commercial_advertising',
            category,
            territories,
            channels,
            duration_days: duration,
            starts_at: start + 'T12:00:00Z',
            exclusivity: 'none',
            sublicensing: false,
            training: false,
            voice_clone: false,
          },
        };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const purchase = user ? canPurchaseLicense(user) : { ok: false as const, reason: 'unauthenticated' as const };
      if (purchase.ok && user) {
        const r = await api<{
          id: string;
          decision: string;
          reason_codes: string[];
          missing_fields?: string[];
        }>('license-requests', { method: 'POST', body: intentBody(user.organizations[0].id) });
        setResult(r);
        toast('Intención de licencia creada.');
        if (r.decision === 'REQUIRES_APPROVAL') {
          toast('Solicitud enviada. Puedes seguirla en Mis campañas.');
        } else if (r.decision === 'INCOMPLETE') {
          toast('Faltan datos en la solicitud. Completa el formulario.');
        }
      } else {
        const previewBody = rights
          ? { asset_id: a.id, request: intentBody('00000000-0000-4000-8000-ffffffffffff').request }
          : { asset_id: a.id, usage: intentBody('00000000-0000-4000-8000-ffffffffffff').usage };
        const r = await api<{
          preview: boolean;
          decision: string;
          reason_codes: string[];
          missing_fields?: string[];
        }>('public/rights-check', { method: 'POST', body: previewBody });
        setResult({ ...r, preview: true });
        toast('Rights Check listo. Inicia sesión para continuar si el uso es licenciable.');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function continueToLicense() {
    if (!result || result.decision !== 'ALLOW') return;
    setCheckoutBusy(true);
    setError('');
    try {
      if (!user) {
        stashLicenseDraft(currentDraft('continue'));
        router.push('/login?next=' + encodeURIComponent('/creators/' + pathId));
        return;
      }
      const purchase = canPurchaseLicense(user);
      if (!purchase.ok) {
        stashLicenseDraft(currentDraft('continue'));
        if (purchase.reason === 'no_organization') {
          router.push('/company/setup?next=' + encodeURIComponent('/creators/' + pathId));
          return;
        }
        toast('Se necesita una organización de marca para comprar licencias.');
        setError('Se necesita una organización de marca para comprar licencias.');
        return;
      }
      let requestId = result.id;
      if (!requestId || result.preview) {
        const r = await api<{ id: string; decision: string }>('license-requests', {
          method: 'POST',
          body: intentBody(user.organizations[0].id),
        });
        if (r.decision !== 'ALLOW') {
          setResult({ ...r, reason_codes: [], preview: false });
          toast('La decisión cambió tras iniciar sesión. Revisa el Rights Check.');
          return;
        }
        requestId = r.id;
      }
      const q = await api<{ id: string }>('quotes', {
        method: 'POST',
        body: { request_id: requestId },
      });
      const o = await api<{ id: string }>('orders', { method: 'POST', body: { quote_id: q.id } });
      router.push('/company/orders/' + o.id);
    } catch (err) {
      setError((err as Error).message);
      toast((err as Error).message);
    } finally {
      setCheckoutBusy(false);
    }
  }

  async function persistApprovalRequest() {
    setCheckoutBusy(true);
    setError('');
    try {
      if (!user) {
        stashLicenseDraft(currentDraft('request_approval'));
        router.push('/login?next=' + encodeURIComponent('/creators/' + pathId));
        return;
      }
      const purchase = canPurchaseLicense(user);
      if (!purchase.ok) {
        stashLicenseDraft(currentDraft('request_approval'));
        if (purchase.reason === 'no_organization') {
          router.push('/company/setup?next=' + encodeURIComponent('/creators/' + pathId));
          return;
        }
        setError('Se necesita una organización de marca para solicitar aprobación.');
        return;
      }
      const r = await api<{
        id: string;
        decision: string;
        reason_codes: string[];
        missing_fields?: string[];
      }>('license-requests', { method: 'POST', body: intentBody(user.organizations[0].id) });
      setResult(r);
      if (r.decision === 'REQUIRES_APPROVAL') {
        toast('Solicitud enviada. Puedes seguirla en Mis campañas.');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCheckoutBusy(false);
    }
  }

  const toggle = (list: string[], value: string, set: (v: string[]) => void) =>
    set(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  return (
    <>
      <Link href="/discover" className="back-link">
        <ArrowLeft size={16} />
        Volver al talento
      </Link>
      <div className="detail-layout">
        <section className="detail-profile">
          <div className="detail-gallery" aria-label="Imágenes">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={'detail-portrait' + (i === 0 ? ' detail-portrait-main' : '')}
              >
                <Image
                  src={a.portrait}
                  alt={
                    i === 0
                      ? 'Ilustración de ' + a.display_name + ' · perfil ficticio'
                      : ''
                  }
                  fill
                  sizes="(max-width: 900px) 90vw, 28vw"
                  priority={i === 0}
                />
              </div>
            ))}
          </div>
          <div className="detail-name">
            <div>
              <span className="eyebrow">
                {nicheLabel.toUpperCase()} · CREADOR/A
              </span>
              <h1>
                {a.display_name}
                <ShieldCheck size={25} />
              </h1>
              <p>
                <Globe2 size={15} />
                {a.location}
              </p>
            </div>
            <Badge value={approval} />
          </div>

          <div className="detail-about">
            <h2>Sobre</h2>
            <p className="detail-bio">{a.bio}</p>
          </div>

          <div className="detail-available">
            <h2>Disponible para</h2>
            <ul>
              {ops.includes('synthetic_video') ? (
                <li>
                  <Check size={16} /> AI vídeo
                </li>
              ) : null}
              {ops.includes('synthetic_image') ? (
                <li>
                  <Check size={16} /> AI imagen
                </li>
              ) : null}
              {allowsCommercialAds(a.policy) ? (
                <li>
                  <Check size={16} /> Anuncios comerciales
                </li>
              ) : null}
            </ul>
          </div>

          <div className="detail-pricing-row">
            <div>
              <span className="eyebrow">DESDE</span>
              <b>{fromPrice == null ? '—' : money(fromPrice)}</b>
            </div>
            <div>
              <span className="eyebrow">APROBACIÓN TÍPICA</span>
              <b>{approval === 'automatic' ? 'Automática' : 'Del creador'}</b>
            </div>
          </div>

          {!configuring ? (
            <Button className="full-width" type="button" onClick={startConfiguring}>
              Configurar licencia
              <ArrowRight size={17} />
            </Button>
          ) : null}

          <div className="rights-summary">
            <h2>Tu creatividad, con reglas claras.</h2>
            <div className="rights-columns">
              <div>
                <h3>
                  <Check size={16} />
                  Permitido
                </h3>
                <p>Publicidad con imagen y vídeo sintéticos</p>
                <p>
                  {allowedList(a.policy, 'territories').join(' · ') || '—'} ·{' '}
                  {allowedList(a.policy, 'channels').join(', ') || '—'}
                </p>
                <p>Uso no exclusivo de 30 o 90 días</p>
              </div>
              <div>
                <h3>
                  <LockKeyhole size={16} />
                  Fuera de la licencia
                </h3>
                <p>Clonación de voz y entrenamiento</p>
                <p>{deniedSummary(a.policy) || 'Restricciones de plataforma'}</p>
                <p>Sublicencia y cesión a terceros</p>
              </div>
            </div>
          </div>
          <button className="passport-toggle" onClick={() => setPassport(!passport)}>
            <span>
              <FileCheck2 size={19} />
              Rights Passport <small>v{a.policy_version}.0</small>
            </span>
            <ChevronDown size={17} />
          </button>
          {passport ? (
            <pre className="json-view">
              {JSON.stringify(passportJson ?? { loading: true }, null, 2)}
            </pre>
          ) : null}
        </section>

        <aside className="license-config" ref={configRef} id="configurar-licencia">
          {!configuring ? (
            <div className="config-heading">
              <span className="eyebrow">LICENCIAR ESTE TALENTO</span>
              <h2>Todavía no estás comprando</h2>
              <p>Primero define qué quieres hacer. Luego comprobarás los derechos.</p>
              <Button className="full-width" type="button" onClick={startConfiguring}>
                Configurar licencia
                <ArrowRight size={17} />
              </Button>
            </div>
          ) : (
            <>
              <div className="config-heading">
                <span className="eyebrow">INTENCIÓN DE LICENCIA</span>
                <h2>Configura tu uso</h2>
                <p>
                  Esto define una intención de licencia estructurada. Todavía no compras.
                </p>
              </div>
              <dl className="intent-readonly">
                <div>
                  <dt>Creador</dt>
                  <dd>{a.display_name}</dd>
                </div>
                <div>
                  <dt>Propósito</dt>
                  <dd>Publicidad comercial</dd>
                </div>
                <div>
                  <dt>Exclusividad</dt>
                  <dd>Ninguna</dd>
                </div>
              </dl>
              <form onSubmit={submit} className="intent-form">
                <label>
                  Nombre de la campaña
                  <Input
                    required
                    minLength={3}
                    maxLength={120}
                    placeholder="Ej. Nueva colección de otoño"
                    value={campaign}
                    onChange={(e) => setCampaign(e.target.value)}
                  />
                </label>
                <label>
                  Tipo de contenido
                  <select value={operation} onChange={(e) => setOperation(e.target.value)}>
                    <option value="synthetic_video">Vídeo generado con IA</option>
                    <option value="synthetic_image">Imagen generada con IA</option>
                  </select>
                </label>
                <label>
                  {rights ? 'Industria' : 'Categoría'}
                  <select value={category} onChange={(e) => setCategory(e.target.value)}>
                    {categoryOptions.map((c) => (
                      <option value={c} key={c}>
                        {labels[c] ?? c}
                      </option>
                    ))}
                  </select>
                </label>
                <fieldset>
                  <legend>Territorio</legend>
                  <div className="check-pills">
                    {territoryOptions.map(([v, l]) => (
                      <label key={v} className={territories.includes(v) ? 'checked' : ''}>
                        <input
                          type="checkbox"
                          checked={territories.includes(v)}
                          onChange={() => toggle(territories, v, setTerritories)}
                        />
                        {l}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>Canales</legend>
                  <div className="check-pills">
                    {['instagram', 'tiktok', 'youtube'].map((v) => (
                      <label key={v} className={channels.includes(v) ? 'checked' : ''}>
                        <input
                          type="checkbox"
                          checked={channels.includes(v)}
                          onChange={() => toggle(channels, v, setChannels)}
                        />
                        {v[0].toUpperCase() + v.slice(1)}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="form-grid">
                  <label>
                    Duración
                    <select
                      value={duration}
                      onChange={(e) => setDuration(Number(e.target.value) as 30 | 90)}
                    >
                      <option value="30">30 días</option>
                      <option value="90">90 días</option>
                    </select>
                  </label>
                  <label>
                    Fecha de inicio
                    <Input
                      type="date"
                      required
                      value={start}
                      min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
                      onChange={(e) => setStart(e.target.value)}
                    />
                  </label>
                </div>
                <div className="price-total">
                  <div>
                    <span>Licencia de {duration} días</span>
                    <small>Comisión incluida · fiscalidad sin configurar</small>
                  </div>
                  <b>{priceMinor == null ? '—' : money(priceMinor)}</b>
                </div>
                {error ? (
                  <p className="inline-error" role="alert">
                    {error}
                  </p>
                ) : null}
                {result ? (
                  <div
                    className={
                      'rights-check-panel decision-' + result.decision.toLowerCase()
                    }
                    role="region"
                    aria-label="Rights Check"
                  >
                    <p className="rights-check-kicker">RIGHTS CHECK</p>
                    <div className="rights-check-header">
                      <strong>{a.display_name}</strong>
                      <span>{campaign || 'Campaña'}</span>
                    </div>

                    {result.decision === 'ALLOW' ? (
                      <ul className="rights-check-allowed">
                        <li>
                          <Check size={16} aria-hidden />
                          {operation === 'synthetic_video'
                            ? 'Vídeo generado con IA permitido'
                            : 'Imagen generada con IA permitida'}
                        </li>
                        <li>
                          <Check size={16} aria-hidden />
                          Publicidad comercial permitida
                        </li>
                        <li>
                          <Check size={16} aria-hidden />
                          {labels[category] ?? category} permitida
                        </li>
                        {territories.map((t) => (
                          <li key={t}>
                            <Check size={16} aria-hidden />
                            {labels[t] ?? t} permitido
                          </li>
                        ))}
                        {channels.map((c) => (
                          <li key={c}>
                            <Check size={16} aria-hidden />
                            {c[0].toUpperCase() + c.slice(1)} permitido
                          </li>
                        ))}
                        <li>
                          <Check size={16} aria-hidden />
                          {duration} días permitidos
                        </li>
                      </ul>
                    ) : null}

                    {result.decision === 'ALLOW' || result.decision === 'REQUIRES_APPROVAL' ? (
                      <dl className="rights-check-meta">
                        <div>
                          <dt>Aprobación del creador</dt>
                          <dd>{approval === 'automatic' ? 'Automática' : 'Del creador'}</dd>
                        </div>
                        <div>
                          <dt>Precio de licencia</dt>
                          <dd>{priceMinor == null ? '—' : money(priceMinor)}</dd>
                        </div>
                      </dl>
                    ) : null}

                    <div className="rights-check-verdict">
                      <span className="rights-check-verdict-label">DECISIÓN RIGHTSNET</span>
                      {result.decision === 'ALLOW' ? (
                        <p className="rights-check-verdict-allow">
                          <Check size={22} aria-hidden /> LICENSABLE
                        </p>
                      ) : null}
                      {result.decision === 'DENY' ? (
                        <p className="rights-check-verdict-deny">
                          <X size={22} aria-hidden /> NO LICENSABLE
                        </p>
                      ) : null}
                      {result.decision === 'REQUIRES_APPROVAL' ? (
                        <p className="rights-check-verdict-pending">REQUIERE APROBACIÓN</p>
                      ) : null}
                      {result.decision === 'INCOMPLETE' ? (
                        <p className="rights-check-verdict-pending">INCOMPLETA</p>
                      ) : null}
                    </div>

                    {result.decision === 'ALLOW' ? (
                      <Button
                        className="full-width"
                        disabled={checkoutBusy}
                        type="button"
                        onClick={() => void continueToLicense()}
                      >
                        {checkoutBusy ? 'Preparando…' : 'Continuar'}
                        <ArrowRight size={17} />
                      </Button>
                    ) : null}

                    {result.decision === 'DENY' ? (
                      <div className="rights-check-deny-block">
                        <h3>Motivo</h3>
                        <p>
                          {result.reason_codes.map(reasonText).join(' ') ||
                            'La política del creador no permite este uso.'}
                        </p>
                        <p className="rights-check-stop">
                          No se puede continuar al checkout. Cambia el uso o elige otro talento.
                        </p>
                      </div>
                    ) : null}

                    {result.decision === 'REQUIRES_APPROVAL' ? (
                      <div className="rights-check-approval-path">
                        <p>
                          <strong>Camino: aprobación del creador.</strong> Todavía no puedes pagar.
                        </p>
                        {result.preview || !result.id ? (
                          <>
                            <p className="muted">
                              Crea cuenta u organización para enviar la solicitud al creador.
                            </p>
                            <Button
                              className="full-width"
                              type="button"
                              disabled={checkoutBusy}
                              onClick={() => void persistApprovalRequest()}
                            >
                              {checkoutBusy ? 'Enviando…' : 'Solicitar aprobación'}
                              <ArrowRight size={17} />
                            </Button>
                          </>
                        ) : (
                          <>
                            <ol className="approval-next-steps">
                              <li>Solicitud enviada al creador.</li>
                              <li>Espera a que apruebe (o rechace) en su panel.</li>
                              <li>
                                Cuando esté <strong>Aprobada</strong>, ve a Mis campañas y pulsa{' '}
                                <strong>Completar licencia</strong> para el contrato y el pago.
                              </li>
                            </ol>
                            <Button asChild className="full-width" variant="outline">
                              <Link href="/company">Ir a Mis campañas</Link>
                            </Button>
                          </>
                        )}
                      </div>
                    ) : null}
                    {result.decision === 'INCOMPLETE' ? (
                      <p>Faltan campos: {(result.missing_fields ?? []).join(', ')}</p>
                    ) : null}
                  </div>
                ) : null}
                <Button
                  className="full-width"
                  disabled={busy || !territories.length || !channels.length || priceMinor == null}
                >
                  {busy
                    ? 'Comprobando derechos…'
                    : approval === 'manual'
                      ? 'Solicitar aprobación'
                      : 'Comprobar derechos'}
                  <ArrowRight size={17} />
                </Button>
                <p className="config-footnote">
                  <ShieldCheck size={14} />
                  El Rights Check decide si puedes continuar. No se puede saltar un DENY.
                </p>
              </form>
            </>
          )}
        </aside>
      </div>
      <SandboxNote />
    </>
  );
}
