'use client';
import { useEffect, useState } from 'react';
import { api, date } from '@/lib/api';
import { ErrorPanel, Loading } from './common';
import { Button } from './ui/button';

type Check = { status: string; reason: string };
type Evidence = {
  id: string;
  asset_id: string;
  grant_id: string;
  provider: string;
  status: string;
  checks: Check[];
  expires_at?: string;
  reported_at?: string;
  sha256?: string | null;
};
type Flight = {
  postflight: { status: string; checks: Check[] };
  revision: number;
  can_edit: boolean;
  evaluated_at: string;
  preflight: { status: string; checks: Check[]; clearance: { reason_codes: string[] } };
  authorizations: Evidence[];
  outputs: Evidence[];
  agreements: {
    asset_id: string;
    display_name: string;
    grant_id: string | null;
    source_type: string | null;
    source_id: string | null;
    status: string | null;
    valid_until: string | null;
    approval_required: boolean;
  }[];
};
const states: Record<string, string> = {
  ALLOW: 'Comprobaciones técnicas superadas',
  DENY: 'Bloqueado',
  INCOMPLETE: 'Falta evidencia',
  REQUIRES_APPROVAL: 'Aprobación pendiente',
};
const reasons: Record<string, string> = {
  NO_OUTPUTS: 'Vincula al menos un output registrado.',
  TALENT_OUTPUT_MISSING: 'Falta un output técnicamente consistente para cada talento.',
  OUTPUT_POSTFLIGHT: 'Hay un output con comprobaciones pendientes o bloqueadas. Revisa su detalle.',
  REPORT_IN_FUTURE: 'El registro indica un reporte en el futuro.',
  CAMPAIGN_CLEARANCE: 'Revisa la cobertura y los motivos en Derechos.',
  NO_VALID_LINKED_AUTH: 'Falta una autorización vigente y compatible para cada talento.',
  STALE_LINK: 'La evidencia ya no coincide con el talento y derecho seleccionados.',
  AUTH_BINDING_INVALID: 'La firma o los datos de autorización no coinciden.',
  USE_MISMATCH: 'El uso de la evidencia difiere del uso de campaña.',
  CAMPAIGN_USE_MISSING: 'Completa el uso de campaña en Derechos.',
  AUTH_SINGLE_TERRITORY_ONLY:
    'Esta autorización acredita un territorio. La campaña tiene varios y necesita revisión.',
  EXPIRED: 'La autorización ha caducado.',
  REVOKED: 'La autorización fue revocada.',
  CONSUMED: 'La autorización ya fue utilizada.',
  AUTH_NOT_STARTED: 'La autorización todavía no ha comenzado.',
  GRANT_NOT_CURRENT: 'El derecho no está vigente actualmente.',
  CAMPAIGN_ENDED: 'La campaña ha finalizado.',
  OUTPUT_EVIDENCE_INVALID: 'No se puede verificar la evidencia del output.',
  OUTPUT_BINDING_INVALID: 'Los datos del output y su autorización no coinciden.',
  AUTH_NOT_CONSUMED: 'No consta el consumo de la autorización.',
  REPORT_OUTSIDE_AUTH_WINDOW: 'El reporte está fuera de la ventana autorizada.',
  MISSING_EVIDENCE: 'Hay referencias de evidencia que ya no están disponibles.',
};
export function CampaignFlight({
  id,
  section,
  onChanged,
}: {
  id: string;
  section: string;
  onChanged: () => Promise<void>;
}) {
  const [data, setData] = useState<Flight | null>(null),
    [refresh, setRefresh] = useState(0),
    [reference, setReference] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let ignore = false;
    setData(null);
    setError('');
    void api<Flight>(`campaigns/${id}/flight`)
      .then((r) => {
        if (!ignore) setData(r);
      })
      .catch((e) => {
        if (!ignore) setError(e.message);
      });
    return () => {
      ignore = true;
    };
  }, [id, refresh, section]);
  const kind = section === 'production' ? 'AUTH' : 'OUTPUT';
  async function change(evidence_id: string, remove = false) {
    setBusy(true);
    setError('');
    try {
      await api(`campaigns/${id}/evidence${remove ? '/remove' : ''}`, {
        method: 'POST',
        body: { kind, evidence_id },
      });
      setReference('');
      await onChanged();
      setRefresh((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const blockers = (checks: Check[]) => {
    const blocked = checks.filter((c) => c.status !== 'ALLOW');
    return (
      <ul>
        {[...new Set(blocked.map((c) => c.reason))].map((reason) => (
          <li key={reason}>{reasons[reason] ?? reason}</li>
        ))}
      </ul>
    );
  };
  const title =
    section === 'production'
      ? 'Producción y preflight'
      : section === 'outputs'
        ? 'Outputs y postflight'
        : section === 'approvals'
          ? 'Aprobaciones pendientes'
          : 'Licencias y acuerdos';
  return (
    <section className="talent-workspace">
      <h2>{title}</h2>
      {error ? <ErrorPanel message={error} /> : null}
      {!data && !error ? <Loading /> : null}
      {data ? (
        <>
          <p>
            Consulta del {new Date(data.evaluated_at).toLocaleString('es-ES')} · revisión{' '}
            {data.revision}
          </p>
          <Button variant="outline" disabled={busy} onClick={() => setRefresh((n) => n + 1)}>
            Actualizar comprobaciones
          </Button>
          {section === 'production' || section === 'outputs' ? (
            <>
              <p>
                {section === 'production'
                  ? 'Vincula una autorización existente del proveedor para comprobarla antes de producir.'
                  : 'Vincula un output registrado para contrastar su autorización y los derechos actuales.'}{' '}
                Estas comprobaciones no crean permisos ni ejecutan generación.
              </p>
              {section === 'production' ? (
                <article className="panel">
                  <h3>Preflight: {states[data.preflight.status]}</h3>
                  {blockers(data.preflight.checks)}
                </article>
              ) : (
                <article className="panel">
                  <h3>Postflight: {states[data.postflight.status]}</h3>
                  {blockers(data.postflight.checks)}
                  <p>
                    Se verifica el registro de producción. El archivo y su contenido visual no se
                    han inspeccionado.
                  </p>
                </article>
              )}
              {data.can_edit ? (
                <form
                  className="panel talent-filters"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void change(reference);
                  }}
                >
                  <label>
                    Referencia {kind === 'AUTH' ? 'RN-AUTH' : 'GenerationRecord'} (UUID)
                    <input
                      aria-label="Referencia de evidencia"
                      className="input"
                      required
                      pattern="[a-fA-F0-9-]{36}"
                      value={reference}
                      onChange={(e) => setReference(e.target.value.trim())}
                      disabled={busy}
                    />
                  </label>
                  <Button type="submit" disabled={busy}>
                    Vincular evidencia
                  </Button>
                </form>
              ) : (
                <p>Acceso de lectura.</p>
              )}
              {(section === 'production' ? data.authorizations : data.outputs).map((item) => (
                <article className="panel" key={item.id}>
                  <h3>
                    {item.provider} · {states[item.status]}
                  </h3>
                  <p>Referencia: {item.id}</p>
                  <p>
                    Talento:{' '}
                    {data.agreements.find((a) => a.asset_id === item.asset_id)?.display_name ??
                      'Ya no vinculado'}
                  </p>
                  {item.expires_at ? (
                    <p>Autorización hasta {new Date(item.expires_at).toLocaleString('es-ES')}</p>
                  ) : null}
                  {item.reported_at ? <p>Registrado el {date(item.reported_at)}</p> : null}
                  {item.sha256 ? (
                    <p>Hash declarado: {item.sha256}. Archivo sin verificar.</p>
                  ) : null}
                  {blockers(item.checks)}
                  {data.can_edit ? (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => void change(item.id, true)}
                    >
                      Retirar vínculo
                    </Button>
                  ) : null}
                </article>
              ))}
              {!(section === 'production' ? data.authorizations : data.outputs).length ? (
                <p>No hay evidencias vinculadas en esta sección.</p>
              ) : null}
            </>
          ) : (
            <>
              <p>
                {section === 'approvals'
                  ? 'Las condiciones registradas deben resolverse en su acuerdo de origen. Vincular evidencia no las aprueba.'
                  : 'Referencias explícitas de los derechos seleccionados en Talento. La vigencia no acredita por sí sola el uso de la campaña.'}
              </p>
              {!data.agreements.length ? (
                <p>Añade talento a la campaña para consultar sus acuerdos.</p>
              ) : null}
              {data.agreements.map((a) => (
                <article className="panel" key={a.asset_id}>
                  <h3>{a.display_name}</h3>
                  {a.grant_id ? (
                    <>
                      <p>
                        {a.source_type === 'MARKETPLACE_LICENSE'
                          ? 'Licencia de marketplace'
                          : 'Acuerdo existente'}{' '}
                        · {a.status}
                      </p>
                      <p>Referencia de origen: {a.source_id}</p>
                      <p>Derecho: {a.grant_id}</p>
                      <p>Hasta {date(a.valid_until!)}</p>
                      <p>
                        {a.approval_required
                          ? 'Condiciones de aprobación pendientes de revisión.'
                          : 'Sin condiciones de aprobación registradas; consulta también el resultado en Derechos.'}
                      </p>
                    </>
                  ) : (
                    <p>No hay derecho seleccionado.</p>
                  )}
                </article>
              ))}
            </>
          )}
        </>
      ) : null}
    </section>
  );
}
