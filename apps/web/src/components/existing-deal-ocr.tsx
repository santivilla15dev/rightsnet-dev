'use client';

import { useState, type FormEvent } from 'react';
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

export function ExistingDealOcrIngest() {
  const { user, loading: sessionLoading } = useSession();
  const [organizationId, setOrganizationId] = useState(DEMO_ORGANIZATIONS[0].id);
  const [assetId, setAssetId] = useState(DEMO_ASSET_ID);
  const [title, setTitle] = useState('Contrato Existing Deal');
  const [agreement, setAgreement] = useState<AgreementRow | null>(null);
  const [proposedJson, setProposedJson] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

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
  if (user.role !== 'admin')
    return <ErrorPanel message="Existing Deal / OCR ingest es solo para admin en v0.1." />;

  return (
    <>
      <Title
        eyebrow="EXISTING DEAL"
        title="Ingest de contrato (OCR L2)."
        description="Crear acuerdo → adjuntar PDF/imagen → extract sandbox → revisar → confirmar Grant. El extract nunca crea el Grant solo."
      />
      <p className="muted">
        <Link href="/ops/rights">← Rights Overview</Link>
        {' · '}
        <Link href="/ops">Ops</Link>
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
                {DEMO_ORGANIZATIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.legal_name}
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
