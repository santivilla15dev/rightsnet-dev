'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from './ui/button';
import { ErrorPanel, Loading } from './common';

type Usage = {
  industry?: string;
  operation?: string;
  purpose?: string;
  territories?: string[];
  channels?: string[];
  start_at?: string;
  duration_days?: number;
};
type Check = { dimension: string; status: string; reason: string };
type Result = {
  revision: number;
  usage: Usage;
  can_edit: boolean;
  status: string;
  score: number;
  passed_checks: number;
  total_checks: number;
  evaluated_at: string;
  items: { asset_id: string; display_name: string; status: string; checks: Check[] }[];
  reason_codes: string[];
};
const states: Record<string, string> = {
  ALLOW: 'Cobertura declarada completa',
  DENY: 'Uso bloqueado',
  INCOMPLETE: 'Faltan datos',
  REQUIRES_APPROVAL: 'Aprobación pendiente',
};
const dimensions: Record<string, string> = {
  selection: 'Derecho seleccionado',
  status: 'Vigencia actual',
  window: 'Fechas de campaña',
  operation: 'Generación visual',
  purpose: 'Uso comercial',
  industry: 'Industria',
  territories: 'Territorios',
  channels: 'Canales',
  duration: 'Duración',
  approval: 'Condiciones de aprobación',
};
const reasons: Record<string, string> = {
  NO_SELECTED_GRANT: 'Selecciona un derecho en Talento.',
  INVALID_GRANT: 'El derecho no tiene datos válidos para esta campaña.',
  GRANT_NOT_ACTIVE: 'El derecho está suspendido, revocado o caducado.',
  GRANT_EXPIRED: 'El derecho ha caducado.',
  GRANT_NOT_STARTED: 'El derecho todavía no está vigente.',
  USAGE_WINDOW_MISSING: 'Falta inicio o duración.',
  WINDOW_OUT_OF_SCOPE: 'Las fechas no están cubiertas o el inicio ya pasó.',
  USAGE_FIELD_MISSING: 'Completa este dato del uso previsto.',
  RIGHT_UNSPECIFIED: 'El permiso no está especificado.',
  RIGHT_DENIED: 'El acuerdo deniega este uso.',
  RIGHT_APPROVAL_REQUIRED: 'El permiso requiere aprobación.',
  GRANT_SCOPE_MISSING: 'El acuerdo no declara este alcance.',
  SCOPE_OUT_OF_BOUNDS: 'El uso solicitado supera el alcance declarado.',
  GRANT_DURATION_MISSING: 'El acuerdo no declara una duración.',
  DURATION_OUT_OF_SCOPE: 'La duración supera la declarada.',
  GRANT_APPROVAL_REQUIRED: 'Hay condiciones de aprobación por revisar.',
};
export function CampaignClearance({
  id,
  onChanged,
}: {
  id: string;
  onChanged: () => Promise<void>;
}) {
  const [result, setResult] = useState<Result | null>(null),
    [usage, setUsage] = useState<Usage>({}),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0),
    [dirty, setDirty] = useState(false);
  useEffect(() => {
    let ignore = false;
    setResult(null);
    setError('');
    void api<Result>(`campaigns/${id}/clearance`)
      .then((r) => {
        if (!ignore) {
          setResult(r);
          setUsage(r.usage);
          setDirty(false);
        }
      })
      .catch((e) => {
        if (!ignore) setError(e.message);
      });
    return () => {
      ignore = true;
    };
  }, [id, refresh]);
  const change = (key: keyof Usage, value: unknown) => {
    setUsage((u) => ({ ...u, [key]: value }));
    setDirty(true);
  };
  async function save() {
    setBusy(true);
    setError('');
    try {
      await api(`campaigns/${id}/usage`, {
        method: 'POST',
        body: { usage, expected_revision: result!.revision },
      });
      await onChanged();
      setRefresh((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const select = (key: keyof Usage, label: string, options: [string, string][]) => (
    <label>
      {label}
      <select
        aria-label={label}
        disabled={!result?.can_edit || busy}
        value={String(usage[key] ?? '')}
        onChange={(e) => change(key, e.target.value || undefined)}
      >
        <option value="">Sin especificar</option>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <section className="talent-workspace">
      <h2>Derechos de campaña</h2>
      <p>
        Para campañas con personas reales, comprueba si sus derechos declarados cubren el uso
        previsto. Un personaje ficticio creado íntegramente con IA no necesita licenciar el likeness
        de un talento en RightsNet.
      </p>
      <p>Este resultado no autoriza generación ni acredita validez legal.</p>
      {error ? <ErrorPanel message={error} /> : null}
      {!result && !error ? <Loading /> : null}
      {result ? (
        <>
          <form
            className="panel campaign-editor"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <h3>Uso previsto</h3>
            <div className="talent-filters">
              {select('industry', 'Industria', [
                ['beauty', 'Belleza'],
                ['lifestyle', 'Lifestyle'],
                ['fashion', 'Moda'],
                ['alcohol', 'Alcohol'],
                ['gambling', 'Apuestas'],
                ['tobacco', 'Tabaco'],
                ['political_advertising', 'Publicidad política'],
                ['adult', 'Adultos'],
              ])}
              {select('operation', 'Generación', [
                ['synthetic_image', 'Imagen con IA'],
                ['synthetic_video', 'Vídeo con IA'],
              ])}
              {select('purpose', 'Propósito', [['commercial_advertising', 'Publicidad comercial']])}
              <label>
                Inicio (UTC)
                <input
                  aria-label="Inicio (UTC)"
                  className="input"
                  type="datetime-local"
                  disabled={!result.can_edit || busy}
                  value={usage.start_at?.slice(0, 16) ?? ''}
                  onChange={(e) =>
                    change(
                      'start_at',
                      e.target.value ? new Date(e.target.value + 'Z').toISOString() : undefined,
                    )
                  }
                />
              </label>
              <label>
                Duración en días
                <input
                  aria-label="Duración en días"
                  className="input"
                  type="number"
                  min={1}
                  max={365}
                  disabled={!result.can_edit || busy}
                  value={usage.duration_days ?? ''}
                  onChange={(e) =>
                    change('duration_days', e.target.value ? Number(e.target.value) : undefined)
                  }
                />
              </label>
            </div>
            {(
              [
                [
                  'territories',
                  'Territorios',
                  [
                    ['AT', 'Austria'],
                    ['DE', 'Alemania'],
                  ],
                ],
                [
                  'channels',
                  'Canales',
                  [
                    ['instagram', 'Instagram'],
                    ['tiktok', 'TikTok'],
                    ['youtube', 'YouTube'],
                  ],
                ],
              ] as const
            ).map(([key, label, options]) => (
              <fieldset key={key} disabled={!result.can_edit || busy}>
                <legend>{label}</legend>
                {options.map(([value, text]) => (
                  <label key={value}>
                    <input
                      type="checkbox"
                      checked={usage[key]?.includes(value) ?? false}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...(usage[key] ?? []), value]
                          : (usage[key] ?? []).filter((x) => x !== value);
                        change(key, next.length ? next : undefined);
                      }}
                    />
                    {text}
                  </label>
                ))}
              </fieldset>
            ))}
            {result.can_edit ? (
              <Button type="submit" disabled={busy}>
                {busy ? 'Guardando…' : 'Guardar uso y evaluar'}
              </Button>
            ) : (
              <p>Acceso de lectura.</p>
            )}
          </form>
          {dirty ? (
            <p role="status">Cambios sin guardar. La evaluación corresponde al uso guardado.</p>
          ) : null}
          <section className="panel" aria-label="Resultado de cobertura">
            <h3>{states[result.status]}</h3>
            <p>
              <strong>{result.score}%</strong> de comprobaciones cubiertas ({result.passed_checks}/
              {result.total_checks})
            </p>
            <progress aria-label="Cobertura declarada" max={100} value={result.score} />
            <p>
              Evaluado: {new Date(result.evaluated_at).toLocaleString('es-ES')} · revisión{' '}
              {result.revision}
            </p>
            <p>Actualiza para comprobar cambios en los derechos.</p>
            <Button variant="outline" disabled={busy} onClick={() => setRefresh((n) => n + 1)}>
              Recargar uso y evaluación
            </Button>
            {!result.items.length ? (
              <p>Añade talento y selecciona sus derechos para evaluar la campaña.</p>
            ) : null}
          </section>
          {result.items.map((item) => (
            <article className="panel" key={item.asset_id}>
              <h3>
                {item.display_name} · {states[item.status]}
              </h3>
              <ul>
                {item.checks.map((c) => (
                  <li key={c.dimension}>
                    <strong>{dimensions[c.dimension]}</strong>:{' '}
                    {c.status === 'ALLOW' ? 'Cubierto' : states[c.status]}
                    {c.status !== 'ALLOW' ? ` — ${reasons[c.reason] ?? c.reason}` : ''}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </>
      ) : null}
    </section>
  );
}
