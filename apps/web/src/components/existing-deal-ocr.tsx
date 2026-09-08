'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { DEMO_ORGANIZATIONS } from '@/lib/rights-operations-ui';
import { useSession } from './session';
import { Button } from './ui/button';
import { AuthRequired, ErrorPanel, Loading, SandboxNote, Title } from './common';

/** Seed Rights Core asset used in sandbox demos. */
const DEMO_ASSET_ID = '30000000-0000-4000-8000-000000000010';

type AgreementRow = {
  id: string;
  status: string;
  title: string;
  organization_id: string;
  asset_id: string;
  extract_status?: string;
  proposed_rights?: unknown;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

function canWriteIngest(user: { role: string; organizations?: { id: string; role: string }[] } | null) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return (user.organizations ?? []).some((o) => o.role === 'owner');
}

export function ExistingDealOcrIngest() {
  const { user, loading: sessionLoading } = useSession();
  const isAdmin = user?.role === 'admin';
  const ownerOrgs = useMemo(
    () => (user?.organizations ?? []).filter((o) => o.role === 'owner'),
    [user],
  );
  const [organizationId, setOrganizationId] = useState(DEMO_ORGANIZATIONS[0].id);
  const [assetId, setAssetId] = useState(DEMO_ASSET_ID);
  const [title, setTitle] = useState('Contrato Existing Deal');
  const [agreement, setAgreement] = useState<AgreementRow | null>(null);
  const [proposedJson, setProposedJson] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [csvText, setCsvText] = useState('');
  const [bulkResult, setBulkResult] = useState<{
    created: { row: number; id: string; title: string }[];
    errors: { row: number; message: string }[];
    total_rows: number;
  } | null>(null);
  const [pendingList, setPendingList] = useState<AgreementRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [bulkConfirmResult, setBulkConfirmResult] = useState<{
    confirmed: {
      id: string;
      title: string;
      grant_id: string;
      grant_status: string;
      idempotent: boolean;
    }[];
    errors: { id: string; message: string }[];
    total: number;
  } | null>(null);

  useEffect(() => {
    if (!user) return;
    if (isAdmin) setOrganizationId(DEMO_ORGANIZATIONS[0].id);
    else if (ownerOrgs[0]) setOrganizationId(ownerOrgs[0].id);
  }, [user, isAdmin, ownerOrgs]);

  const defaultProposed = {
    rights: {
      synthetic_video: 'ALLOW',
      synthetic_image: 'ALLOW',
      commercial_advertising: 'ALLOW',
    },
    industry: ['beauty'],
    territories: ['DE', 'AT'],
    approval: {},
    valid_from: '2026-01-01T00:00:00.000Z',
    valid_until: '2027-12-31T23:59:59.000Z',
  };

  async function runBulkCsv(e: FormEvent) {
    e.preventDefault();
    setBusy('bulk');
    setError('');
    setMessage('');
    setBulkResult(null);
    try {
      const result = await api<{
        created: { row: number; id: string; title: string }[];
        errors: { row: number; message: string }[];
        total_rows: number;
      }>('admin/external-agreements/bulk-csv', {
        method: 'POST',
        body: { csv: csvText, organization_id: organizationId },
      });
      setBulkResult(result);
      setMessage(
        `Bulk: ${result.created.length} creados (pending_confirm), ${result.errors.length} errores. Sin Grant automático.`,
      );
      await loadPending();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function loadPending() {
    setBusy('list');
    setError('');
    try {
      const result = await api<{ items: AgreementRow[] }>(
        'admin/external-agreements?organization_id=' + encodeURIComponent(organizationId) + '&limit=100',
      );
      const pending = (result.items ?? []).filter(
        (r) => r.status === 'pending_confirm' || r.status === 'draft',
      );
      setPendingList(pending);
      setSelectedIds({});
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function runBulkConfirm() {
    const agreement_ids = Object.entries(selectedIds)
      .filter(([, on]) => on)
      .map(([id]) => id);
    if (!agreement_ids.length) {
      setError('Selecciona al menos un acuerdo pendiente.');
      return;
    }
    setBusy('bulk-confirm');
    setError('');
    setMessage('');
    setBulkConfirmResult(null);
    try {
      const result = await api<{
        confirmed: {
          id: string;
          title: string;
          grant_id: string;
          grant_status: string;
          idempotent: boolean;
        }[];
        errors: { id: string; message: string }[];
        total: number;
      }>('admin/external-agreements/bulk-confirm', {
        method: 'POST',
        body: { organization_id: organizationId, agreement_ids },
      });
      setBulkConfirmResult(result);
      setMessage(
        `Bulk confirm: ${result.confirmed.length} Grants, ${result.errors.length} errores (solo IDs marcados).`,
      );
      await loadPending();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function createAgreement(e: FormEvent) {
    e.preventDefault();
    setBusy('create');
    setError('');
    setMessage('');
    try {
      const row = await api<AgreementRow>('admin/external-agreements', {
        method: 'POST',
        body: {
          organization_id: organizationId,
          asset_id: assetId,
          title,
          status: 'pending_confirm',
          proposed_rights: defaultProposed,
        },
      });
      setAgreement(row);
      setProposedJson(JSON.stringify(row.proposed_rights ?? defaultProposed, null, 2));
      setMessage('Acuerdo creado en pending_confirm.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function uploadFile(e: FormEvent) {
    e.preventDefault();
    if (!agreement || !file) return;
    setBusy('upload');
    setError('');
    try {
      const mime =
        file.type === 'application/pdf' ||
        file.type === 'image/jpeg' ||
        file.type === 'image/png'
          ? file.type
          : file.name.toLowerCase().endsWith('.pdf')
            ? 'application/pdf'
            : file.name.toLowerCase().endsWith('.png')
              ? 'image/png'
              : 'image/jpeg';
      const base64 = await fileToBase64(file);
      await api('admin/external-agreements/' + agreement.id + '/files', {
        method: 'POST',
        body: { base64, mime_type: mime, original_filename: file.name },
      });
      setMessage('Archivo adjunto (scan clean en sandbox).');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function runExtract(mode: 'sandbox' | 'live' = 'sandbox') {
    if (!agreement) return;
    setBusy('extract');
    setError('');
    try {
      const result = await api<{
        agreement: AgreementRow;
        proposed_rights: unknown;
        grant_created: boolean;
        mode: string;
      }>('admin/external-agreements/' + agreement.id + '/extract', {
        method: 'POST',
        body: { mode },
      });
      setAgreement(result.agreement);
      setProposedJson(JSON.stringify(result.proposed_rights, null, 2));
      setMessage(
        result.grant_created
          ? 'Extract inesperado creó grant.'
          : `Extract ${result.mode} listo — revisa proposed_rights (aún sin Grant).`,
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function saveProposed(e: FormEvent) {
    e.preventDefault();
    if (!agreement) return;
    setBusy('save');
    setError('');
    try {
      const proposed_rights = JSON.parse(proposedJson) as unknown;
      const row = await api<AgreementRow>(
        'admin/external-agreements/' + agreement.id + '/proposed-rights',
        { method: 'POST', body: { proposed_rights } },
      );
      setAgreement(row);
      setMessage('Borrador proposed_rights guardado.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function confirmAgreement() {
    if (!agreement) return;
    setBusy('confirm');
    setError('');
    try {
      const result = await api<{
        agreement: AgreementRow;
        grant: { id: string; status: string };
        idempotent: boolean;
      }>('admin/external-agreements/' + agreement.id + '/confirm', {
        method: 'POST',
        body: {},
      });
      setAgreement(result.agreement);
      setMessage(
        `Confirmado → Grant ${result.grant.id} (${result.grant.status})` +
          (result.idempotent ? ' · idempotente' : ''),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  }

  if (sessionLoading) return <Loading />;
  if (!user) return <AuthRequired />;
  if (!canWriteIngest(user))
    return (
      <ErrorPanel message="Existing Deal / OCR requiere admin o owner de la organización." />
    );

  const orgOptions = isAdmin
    ? DEMO_ORGANIZATIONS.map((o) => ({ id: o.id, label: o.legal_name }))
    : ownerOrgs.map((o) => ({ id: o.id, label: o.legal_name }));

  return (
    <>
      <Title
        eyebrow="EXISTING DEAL"
        title="Ingest de contrato (OCR)."
        description="Crear acuerdo → adjuntar PDF/imagen → extract → revisar → confirmar Grant. El extract nunca crea el Grant solo."
      />
      <p className="muted">
        <Link href="/ops/rights">← Rights Overview</Link>
        {' · '}
        {isAdmin ? <Link href="/ops">Ops</Link> : <Link href="/company">Campañas</Link>}
      </p>

      <form className="intent-form" onSubmit={(e) => void createAgreement(e)}>
        <fieldset>
          <legend>1. Crear acuerdo</legend>
          <div className="form-grid">
            <label>
              Organización
              <select
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
              >
                {orgOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              asset_id
              <input value={assetId} onChange={(e) => setAssetId(e.target.value.trim())} required />
            </label>
            <label>
              Título
              <input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </label>
          </div>
          <Button type="submit" disabled={!!busy}>
            {busy === 'create' ? 'Creando…' : 'Crear pending_confirm'}
          </Button>
        </fieldset>
      </form>

      <form className="intent-form" onSubmit={(e) => void runBulkCsv(e)}>
        <fieldset>
          <legend>Bulk CSV (máx. 100 filas → pending_confirm)</legend>
          <p className="muted">
            Cabeceras: organization_id,asset_id,title,territories,industry,rights,valid_from,valid_until[,external_ref,approval_json]
            · territories/industry/rights con <code>|</code> · rights como{' '}
            <code>synthetic_video:ALLOW</code>
          </p>
          <label>
            CSV
            <textarea
              rows={8}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              spellCheck={false}
              style={{ fontFamily: 'ui-monospace, monospace', width: '100%' }}
              placeholder={`organization_id,asset_id,title,territories,industry,rights,valid_from,valid_until\n${organizationId},${assetId},Deal demo,DE|AT,beauty,synthetic_video:ALLOW,2026-01-01T00:00:00.000Z,2027-01-01T00:00:00.000Z`}
            />
          </label>
          <Button type="submit" disabled={!!busy || !csvText.trim()}>
            {busy === 'bulk' ? 'Importando…' : 'Importar CSV'}
          </Button>
        </fieldset>
      </form>

      {bulkResult ? (
        <section>
          <h2 className="section-title">Resultado bulk</h2>
          <p>
            Filas: {bulkResult.total_rows} · creados: {bulkResult.created.length} · errores:{' '}
            {bulkResult.errors.length}
          </p>
          {bulkResult.created.length ? (
            <ul>
              {bulkResult.created.map((c) => (
                <li key={c.id}>
                  fila {c.row}: {c.title} · <code>{c.id}</code>
                </li>
              ))}
            </ul>
          ) : null}
          {bulkResult.errors.length ? (
            <ul>
              {bulkResult.errors.map((err) => (
                <li key={err.row + err.message}>
                  fila {err.row}: {err.message}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section className="intent-form">
        <fieldset>
          <legend>Bulk confirm (IDs marcados → RightsGrant)</legend>
          <p className="muted">
            Solo confirma los acuerdos que marques. No hay “confirmar todos” sin selección.
          </p>
          <p>
            <Button
              type="button"
              variant="outline"
              disabled={!!busy}
              onClick={() => void loadPending()}
            >
              {busy === 'list' ? 'Cargando…' : 'Listar pending / draft de la org'}
            </Button>{' '}
            <Button
              type="button"
              disabled={!!busy || !Object.values(selectedIds).some(Boolean)}
              onClick={() => void runBulkConfirm()}
            >
              {busy === 'bulk-confirm' ? 'Confirmando…' : 'Confirmar seleccionados → RightsGrant'}
            </Button>
          </p>
          {pendingList.length ? (
            <ul>
              {pendingList.map((row) => (
                <li key={row.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={!!selectedIds[row.id]}
                      onChange={(e) =>
                        setSelectedIds((prev) => ({ ...prev, [row.id]: e.target.checked }))
                      }
                    />{' '}
                    <b>{row.title}</b> · {row.status} · <code>{row.id}</code>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Sin lista cargada (o sin pendientes).</p>
          )}
        </fieldset>
      </section>

      {bulkConfirmResult ? (
        <section>
          <h2 className="section-title">Resultado bulk confirm</h2>
          <p>
            Total IDs: {bulkConfirmResult.total} · OK: {bulkConfirmResult.confirmed.length} ·
            errores: {bulkConfirmResult.errors.length}
          </p>
          {bulkConfirmResult.confirmed.length ? (
            <ul>
              {bulkConfirmResult.confirmed.map((c) => (
                <li key={c.id}>
                  {c.title} → Grant <code>{c.grant_id}</code> ({c.grant_status})
                  {c.idempotent ? ' · idempotente' : ''}
                </li>
              ))}
            </ul>
          ) : null}
          {bulkConfirmResult.errors.length ? (
            <ul>
              {bulkConfirmResult.errors.map((err) => (
                <li key={err.id + err.message}>
                  <code>{err.id}</code>: {err.message}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {agreement ? (
        <>
          <p className="muted">
            Acuerdo <code>{agreement.id}</code> · status <b>{agreement.status}</b> · extract{' '}
            <b>{agreement.extract_status ?? 'none'}</b>
          </p>

          <form className="intent-form" onSubmit={(e) => void uploadFile(e)}>
            <fieldset>
              <legend>2. Adjuntar archivo</legend>
              <label>
                PDF / JPEG / PNG (máx. 10 MiB)
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <Button type="submit" disabled={!!busy || !file}>
                {busy === 'upload' ? 'Subiendo…' : 'Subir'}
              </Button>
            </fieldset>
          </form>

          <p>
            <Button
              type="button"
              variant="outline"
              disabled={!!busy}
              onClick={() => void runExtract('sandbox')}
            >
              {busy === 'extract' ? 'Extrayendo…' : '3. Extract sandbox'}
            </Button>{' '}
            <Button
              type="button"
              variant="outline"
              disabled={!!busy}
              onClick={() => void runExtract('live')}
            >
              Extract live (L3)
            </Button>
          </p>

          <form className="intent-form" onSubmit={(e) => void saveProposed(e)}>
            <fieldset>
              <legend>4. Revisar proposed_rights</legend>
              <label>
                JSON
                <textarea
                  rows={16}
                  value={proposedJson}
                  onChange={(e) => setProposedJson(e.target.value)}
                  spellCheck={false}
                  style={{ fontFamily: 'ui-monospace, monospace', width: '100%' }}
                />
              </label>
              <Button type="submit" disabled={!!busy}>
                {busy === 'save' ? 'Guardando…' : 'Guardar borrador'}
              </Button>
            </fieldset>
          </form>

          <p>
            <Button
              type="button"
              disabled={!!busy || agreement.status === 'confirmed'}
              onClick={() => void confirmAgreement()}
            >
              {busy === 'confirm' ? 'Confirmando…' : '5. Confirmar → RightsGrant'}
            </Button>
          </p>
        </>
      ) : null}

      {message ? <p role="status">{message}</p> : null}
      {error ? <ErrorPanel message={error} /> : null}
      <SandboxNote />
    </>
  );
}
