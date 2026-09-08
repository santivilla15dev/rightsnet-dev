'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import {
  CAMPAIGN_BUCKET_ROWS,
  DEMO_ORGANIZATIONS,
  OVERVIEW_METRIC_ROWS,
  type CampaignQueryResponse,
  type RightsOverviewResponse,
} from '@/lib/rights-operations-ui';
import { useSession } from './session';
import { Button } from './ui/button';
import { AuthRequired, ErrorPanel, Loading, SandboxNote, Title } from './common';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toDatetimeLocalValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function localInputToIso(value: string) {
  const d = new Date(value + 'Z');
  return d.toISOString();
}

export function RightsOperationsOverview() {
  const { user, loading: sessionLoading } = useSession();
  const search = useSearchParams();
  const router = useRouter();
  const initialOrg = search.get('organization_id') ?? DEMO_ORGANIZATIONS[0].id;
  const [organizationId, setOrganizationId] = useState(initialOrg);
  const [data, setData] = useState<RightsOverviewResponse | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (orgId: string) => {
    if (!UUID_RE.test(orgId)) {
      setError('Indica un organization_id UUID válido.');
      setData(null);
      return;
    }
    setBusy(true);
    try {
      const result = await api<RightsOverviewResponse>(
        'admin/rights-operations/overview?organization_id=' + encodeURIComponent(orgId),
      );
      setData(result);
      setError('');
    } catch (e) {
      setData(null);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'admin') void load(organizationId);
  }, [user, organizationId, load]);

  if (sessionLoading) return <Loading />;
  if (!user) return <AuthRequired />;
  if (user.role !== 'admin')
    return (
      <ErrorPanel message="No tienes permiso de administración para Rights Operations." />
    );

  return (
    <>
      <Title
        eyebrow="RIGHTS OPERATIONS"
        title="Salud del portafolio de derechos."
        description="Métricas derivadas de RightsGrants de esta organización. No modifica la política pública del creador."
        action={
          <Button variant="outline" disabled={busy} onClick={() => void load(organizationId)}>
            <RefreshCw size={16} />
            Actualizar
          </Button>
        }
      />

      <p className="muted">
        <Link href="/ops">← Volver a Ops</Link>
      </p>

      <form
        className="intent-form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          const next = organizationId.trim();
          router.replace('/ops/rights?organization_id=' + encodeURIComponent(next));
          void load(next);
        }}
      >
        <fieldset>
          <legend>Organización</legend>
          <label>
            Demo sandbox
            <select
              value={DEMO_ORGANIZATIONS.some((o) => o.id === organizationId) ? organizationId : ''}
              onChange={(e) => {
                if (!e.target.value) return;
                setOrganizationId(e.target.value);
              }}
            >
              <option value="">— UUID manual —</option>
              {DEMO_ORGANIZATIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.legal_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            organization_id
            <input
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value.trim())}
              spellCheck={false}
              required
            />
          </label>
          <Button type="submit" disabled={busy}>
            Cargar overview
          </Button>
        </fieldset>
      </form>

      {error ? <ErrorPanel message={error} /> : null}
      {busy && !data ? <Loading /> : null}

      {data ? (
        <section>
          <h2 className="section-title">Rights Overview</h2>
          <p className="muted">organization_id: <code>{data.organization_id}</code></p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Métrica</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {OVERVIEW_METRIC_ROWS.map((row) => (
                  <tr key={row.key}>
                    <td>{row.label}</td>
                    <td>
                      <b>{data.metrics[row.key] ?? 0}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            <Button asChild>
              <Link
                href={
                  '/ops/rights/campaign?organization_id=' +
                  encodeURIComponent(data.organization_id)
                }
              >
                Consultar campaña
                <ArrowRight size={16} />
              </Link>
            </Button>
          </p>
        </section>
      ) : null}
      <SandboxNote />
    </>
  );
}

export function RightsOperationsCampaign() {
  const { user, loading: sessionLoading } = useSession();
  const search = useSearchParams();
  const initialOrg = search.get('organization_id') ?? DEMO_ORGANIZATIONS[0].id;

  const defaultWindow = useMemo(() => {
    const start = new Date(Date.UTC(2026, 5, 1, 0, 0, 0));
    const end = new Date(Date.UTC(2026, 5, 30, 23, 59, 0));
    return { start: toDatetimeLocalValue(start), end: toDatetimeLocalValue(end) };
  }, []);

  const [organizationId, setOrganizationId] = useState(initialOrg);
  const [industry, setIndustry] = useState('beauty');
  const [territory, setTerritory] = useState('DE');
  const [windowStart, setWindowStart] = useState(defaultWindow.start);
  const [windowEnd, setWindowEnd] = useState(defaultWindow.end);
  const [contentType, setContentType] = useState('synthetic_video');
  const [purpose, setPurpose] = useState('commercial_advertising');
  const [result, setResult] = useState<CampaignQueryResponse | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!UUID_RE.test(organizationId)) {
      setError('Indica un organization_id UUID válido.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const body = {
        organization_id: organizationId,
        industry,
        territory,
        window_start: localInputToIso(windowStart),
        window_end: localInputToIso(windowEnd),
        content_type: contentType,
        purpose,
      };
      const data = await api<CampaignQueryResponse>('admin/rights-operations/campaign-query', {
        method: 'POST',
        body,
      });
      setResult(data);
    } catch (err) {
      setResult(null);
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (sessionLoading) return <Loading />;
  if (!user) return <AuthRequired />;
  if (user.role !== 'admin')
    return (
      <ErrorPanel message="No tienes permiso de administración para Rights Operations." />
    );

  return (
    <>
      <Title
        eyebrow="RIGHTS OPERATIONS"
        title="¿Quién está cleared para esta campaña?"
        description="Consulta grants de esta organización (no la política pública del marketplace)."
      />
      <p className="muted">
        <Link href={'/ops/rights?organization_id=' + encodeURIComponent(organizationId)}>
          ← Overview
        </Link>
        {' · '}
        <Link href="/ops">Ops</Link>
      </p>

      <form className="intent-form" onSubmit={(e) => void onSubmit(e)}>
        <fieldset>
          <legend>Campaña</legend>
          <div className="form-grid">
            <label>
              Organización (demo)
              <select
                value={DEMO_ORGANIZATIONS.some((o) => o.id === organizationId) ? organizationId : ''}
                onChange={(e) => {
                  if (e.target.value) setOrganizationId(e.target.value);
                }}
              >
                <option value="">— UUID manual —</option>
                {DEMO_ORGANIZATIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.legal_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              organization_id
              <input
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value.trim())}
                spellCheck={false}
                required
              />
            </label>
            <label>
              industry
              <input value={industry} onChange={(e) => setIndustry(e.target.value)} required />
            </label>
            <label>
              territory
              <input value={territory} onChange={(e) => setTerritory(e.target.value)} required />
            </label>
            <label>
              window_start (UTC)
              <input
                type="datetime-local"
                value={windowStart}
                onChange={(e) => setWindowStart(e.target.value)}
                required
              />
            </label>
            <label>
              window_end (UTC)
              <input
                type="datetime-local"
                value={windowEnd}
                onChange={(e) => setWindowEnd(e.target.value)}
                required
              />
            </label>
            <label>
              content_type
              <input value={contentType} onChange={(e) => setContentType(e.target.value)} required />
            </label>
            <label>
              purpose
              <input value={purpose} onChange={(e) => setPurpose(e.target.value)} required />
            </label>
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? 'Consultando…' : 'Consultar'}
          </Button>
        </fieldset>
      </form>

      {error ? <ErrorPanel message={error} /> : null}

      {result ? (
        <section>
          <h2 className="section-title">Resultado</h2>
          <p>
            Relaciones: <b>{result.relationships}</b>
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cubo</th>
                  <th>Cantidad</th>
                  <th>asset_id (máx. 20)</th>
                </tr>
              </thead>
              <tbody>
                {CAMPAIGN_BUCKET_ROWS.map((row) => (
                  <tr key={row.key}>
                    <td>{row.label}</td>
                    <td>
                      <b>{result[row.key]}</b>
                    </td>
                    <td>
                      <code style={{ fontSize: '0.85em' }}>
                        {(result.items[row.key] ?? []).join(', ') || '—'}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      <SandboxNote />
    </>
  );
}
