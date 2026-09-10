'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from './ui/button';
import { ErrorPanel, Loading } from './common';

type Gap = { dimension: string; reason: string; desired: unknown };
type RequestRow = {
  id: string;
  asset_id: string;
  status: string;
  gaps: Gap[];
  desired_usage: Record<string, unknown>;
  note: string;
  revision: number;
  stale_gaps: boolean;
  sent_at: string | null;
};
type Builder = {
  can_edit: boolean;
  clearance: { status: string; score: number; reason_codes: string[] };
  items: {
    asset_id: string;
    display_name: string;
    clearance_status: string;
    suggested_gaps: Gap[];
    stale_gaps: boolean;
  }[];
  requests: RequestRow[];
};

const gapLabels: Record<string, string> = {
  USAGE_FIELD_MISSING: 'Falta un dato del uso previsto',
  GRANT_SCOPE_MISSING: 'El acuerdo no declara este alcance',
  GRANT_DURATION_MISSING: 'El acuerdo no declara duración',
  USAGE_WINDOW_MISSING: 'Faltan fechas de campaña',
  NO_SELECTED_GRANT: 'Selecciona un derecho en Talento',
  INVALID_GRANT: 'Revisar evidencia del derecho',
  GRANT_APPROVAL_REQUIRED: 'Condiciones de aprobación pendientes',
  RIGHT_DENIED: 'Solicitar ampliación: permiso denegado',
  RIGHT_UNSPECIFIED: 'Solicitar aclaración del permiso',
  RIGHT_APPROVAL_REQUIRED: 'Solicitar aprobación del permiso',
  SCOPE_OUT_OF_BOUNDS: 'Solicitar ampliación de alcance',
  DURATION_OUT_OF_SCOPE: 'Solicitar ampliación de duración',
  WINDOW_OUT_OF_SCOPE: 'Solicitar cobertura de fechas',
  GRANT_NOT_ACTIVE: 'El derecho no está activo',
  GRANT_EXPIRED: 'El derecho ha caducado',
  GRANT_NOT_STARTED: 'El derecho aún no inicia',
};
const statusLabel: Record<string, string> = {
  DRAFT: 'Borrador',
  SENT: 'Enviada (registro interno)',
  WITHDRAWN: 'Retirada',
  CLOSED: 'Cerrada',
};

export function CampaignDealBuilder({
  id,
  onChanged,
}: {
  id: string;
  onChanged: () => Promise<void>;
}) {
  const [data, setData] = useState<Builder | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0),
    [notes, setNotes] = useState<Record<string, string>>({}),
    [asset, setAsset] = useState('');

  useEffect(() => {
    let ignore = false;
    setData(null);
    setError('');
    void api<Builder>(`campaigns/${id}/deal-builder`)
      .then((r) => {
        if (ignore) return;
        setData(r);
        const drafts: Record<string, string> = {};
        for (const req of r.requests) {
          if (req.status === 'DRAFT') drafts[req.asset_id] = req.note;
        }
        setNotes((prev) => ({ ...drafts, ...prev }));
        if (!asset && r.items[0]) setAsset(r.items[0].asset_id);
      })
      .catch((e) => {
        if (!ignore) setError(e.message);
      });
    return () => {
      ignore = true;
    };
  }, [id, refresh]);

  async function saveDraft(assetId: string) {
    if (!data) return;
    setBusy(true);
    setError('');
    try {
      const existing = data.requests.find((r) => r.asset_id === assetId && r.status === 'DRAFT');
      const item = data.items.find((i) => i.asset_id === assetId);
      const desired_usage: Record<string, unknown> = {};
      for (const gap of item?.suggested_gaps ?? []) {
        if (gap.desired == null) continue;
        if (gap.dimension === 'window' && typeof gap.desired === 'object') {
          const w = gap.desired as { start_at?: string; duration_days?: number };
          if (w.start_at) desired_usage.start_at = w.start_at;
          if (w.duration_days) desired_usage.duration_days = w.duration_days;
        } else if (gap.dimension === 'industry') desired_usage.industry = gap.desired;
        else if (gap.dimension === 'operation') desired_usage.operation = gap.desired;
        else if (gap.dimension === 'purpose') desired_usage.purpose = gap.desired;
        else if (gap.dimension === 'territories') desired_usage.territories = gap.desired;
        else if (gap.dimension === 'channels') desired_usage.channels = gap.desired;
        else if (gap.dimension === 'duration') desired_usage.duration_days = gap.desired;
      }
      await api(`campaigns/${id}/deal-requests`, {
        method: 'POST',
        body: {
          asset_id: assetId,
          desired_usage,
          note: notes[assetId] ?? '',
          ...(existing ? { expected_revision: existing.revision } : {}),
        },
      });
      await onChanged();
      setRefresh((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function act(requestId: string, action: 'send' | 'withdraw') {
    setBusy(true);
    setError('');
    try {
      await api(`campaigns/${id}/deal-requests/${requestId}/${action}`, {
        method: 'POST',
        body: {},
      });
      await onChanged();
      setRefresh((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const selected = data?.items.find((i) => i.asset_id === asset);
  const draft = data?.requests.find((r) => r.asset_id === asset && r.status === 'DRAFT');
  const history = data?.requests.filter((r) => r.asset_id === asset) ?? [];

  return (
    <section className="talent-workspace">
      <h2>Solicitudes de ampliación</h2>
      <p>
        Esto no modifica derechos ni concede permiso; es una solicitud humana registrada. Sin
        notificaciones externas en esta versión.
      </p>
      {error ? <ErrorPanel message={error} /> : null}
      {!data && !error ? <Loading /> : null}
      {data ? (
        <>
          <p>
            Clearance actual: {data.clearance.status} · score {data.clearance.score}
            {data.clearance.reason_codes.length
              ? ` · ${data.clearance.reason_codes.slice(0, 5).join(', ')}`
              : ''}
          </p>
          {!data.items.length ? <p>Añade talento en la pestaña Talento para proponer huecos.</p> : null}
          {data.items.length ? (
            <label>
              Talento
              <select
                className="input"
                aria-label="Talento para solicitud"
                value={asset}
                onChange={(e) => setAsset(e.target.value)}
                disabled={busy}
              >
                {data.items.map((i) => (
                  <option key={i.asset_id} value={i.asset_id}>
                    {i.display_name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {selected ? (
            <article className="panel">
              <h3>
                Huecos actuales · {selected.display_name} · {selected.clearance_status}
              </h3>
              {selected.stale_gaps || draft?.stale_gaps ? (
                <p>El borrador guardado ya no coincide con el clearance actual. Guárdalo de nuevo.</p>
              ) : null}
              {!selected.suggested_gaps.length ? (
                <p>No hay huecos estructurados para solicitar en este talento.</p>
              ) : (
                <ul>
                  {selected.suggested_gaps.map((g) => (
                    <li key={`${g.dimension}-${g.reason}`}>
                      {g.dimension}: {gapLabels[g.reason] ?? g.reason}
                      {g.desired != null ? ` → ${JSON.stringify(g.desired)}` : ''}
                    </li>
                  ))}
                </ul>
              )}
              {data.can_edit ? (
                <>
                  <label>
                    Nota humana (opcional)
                    <textarea
                      className="input"
                      aria-label="Nota de solicitud"
                      maxLength={2000}
                      rows={3}
                      value={notes[selected.asset_id] ?? ''}
                      onChange={(e) =>
                        setNotes((n) => ({ ...n, [selected.asset_id]: e.target.value }))
                      }
                      disabled={busy}
                    />
                  </label>
                  <Button disabled={busy} onClick={() => void saveDraft(selected.asset_id)}>
                    {draft ? 'Actualizar borrador' : 'Guardar borrador'}
                  </Button>
                  {draft ? (
                    <Button disabled={busy} onClick={() => void act(draft.id, 'send')}>
                      Registrar como enviada
                    </Button>
                  ) : null}
                </>
              ) : (
                <p>Acceso de lectura.</p>
              )}
            </article>
          ) : null}
          {history.length ? (
            <section>
              <h3>Historial de solicitudes</h3>
              {history.map((r) => (
                <article className="panel" key={r.id}>
                  <h4>
                    {statusLabel[r.status] ?? r.status} · revisión {r.revision}
                  </h4>
                  <p>Referencia: {r.id}</p>
                  {r.note ? <p>Nota: {r.note}</p> : null}
                  <ul>
                    {r.gaps.map((g) => (
                      <li key={`${r.id}-${g.dimension}-${g.reason}`}>
                        {g.dimension}: {gapLabels[g.reason] ?? g.reason}
                      </li>
                    ))}
                  </ul>
                  {data.can_edit && r.status === 'SENT' ? (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => void act(r.id, 'withdraw')}
                    >
                      Retirar solicitud
                    </Button>
                  ) : null}
                </article>
              ))}
            </section>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
