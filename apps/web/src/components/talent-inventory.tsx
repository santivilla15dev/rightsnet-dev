'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, date, labels } from '@/lib/api';
import { useSession } from './session';
import { AuthRequired, ErrorPanel, Loading, Title } from './common';
import { Button } from './ui/button';

type Grant = {
  id: string;
  source_id: string;
  source_type: string;
  temporal_status: string;
  valid_from: string;
  valid_until: string;
  rights: Record<string, string> | null;
  territories: string[] | null;
  industry: string[] | null;
  channels: string[] | null;
  duration_days: number | null;
  approval: Record<string, string> | null;
};
type Talent = {
  asset_id: string;
  display_name: string;
  asset_status: string;
  grants: Grant[];
  pending_agreements: number;
};
type Inventory = { items: Talent[]; next_offset: number | null; evaluated_at: string };
type Linked = {
  asset_id: string;
  display_name: string;
  asset_status: string;
  selected_grant: Grant | null;
};
const temporalLabels: Record<string, string> = {
  CURRENT: 'Vigente por fechas',
  SCHEDULED: 'Inicio futuro',
  EXPIRED: 'Caducado',
  SUSPENDED: 'Suspendido',
  REVOKED: 'Revocado',
};
const stateLabels: Record<string, string> = {
  ALLOW: 'Permitido en el acuerdo',
  DENY: 'No permitido',
  REQUIRES_APPROVAL: 'Requiere aprobación',
  NOT_SPECIFIED: 'Sin especificar',
};
function values(items: string[] | null) {
  return items?.length ? items.map((item) => labels[item] ?? item).join(', ') : 'Sin especificar';
}
function GrantSummary({ grant }: { grant: Grant }) {
  return (
    <div className="talent-grant">
      <p>
        <strong>
          {grant.source_type === 'MARKETPLACE_LICENSE'
            ? 'Licencia de marketplace'
            : 'Acuerdo existente'}
        </strong>{' '}
        · {temporalLabels[grant.temporal_status] ?? grant.temporal_status}
      </p>
      <p>
        {date(grant.valid_from)} → {date(grant.valid_until)}
      </p>
      <details>
        <summary>Ver alcance y referencias</summary>
        <dl>
          <dt>Territorios</dt>
          <dd>{values(grant.territories)}</dd>
          <dt>Industrias</dt>
          <dd>{values(grant.industry)}</dd>
          <dt>Canales</dt>
          <dd>{values(grant.channels)}</dd>
          <dt>Duración declarada</dt>
          <dd>{grant.duration_days ? `${grant.duration_days} días` : 'Sin especificar'}</dd>
          <dt>Permisos declarados</dt>
          <dd>
            {grant.rights && Object.keys(grant.rights).length
              ? Object.entries(grant.rights).map(([key, value]) => (
                  <p key={key}>
                    {labels[key] ?? key}: {stateLabels[value] ?? value}
                  </p>
                ))
              : 'Sin especificar'}
          </dd>
          <dt>Condiciones de aprobación</dt>
          <dd>
            {grant.approval && Object.keys(grant.approval).length
              ? 'Hay condiciones registradas que deben revisarse.'
              : 'No hay condiciones registradas.'}
          </dd>
          <dt>Referencia de origen</dt>
          <dd>{grant.source_id}</dd>
          <dt>Referencia de derecho</dt>
          <dd>{grant.id}</dd>
        </dl>
      </details>
    </div>
  );
}
export function RightsInventory({
  organizationId,
  onAdd,
  disabled = false,
}: {
  organizationId: string;
  onAdd?: (asset: string, grant: string | null) => Promise<void>;
  disabled?: boolean;
}) {
  const [visibleGrants, setVisibleGrants] = useState<Record<string, number>>({});
  const [source, setSource] = useState('all');
  const [availability, setAvailability] = useState('all');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Inventory | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let ignore = false;
    setData(null);
    setError('');
    const query = new URLSearchParams({
      organization_id: organizationId,
      source,
      availability,
      q,
      offset: String(offset),
    });
    void api<Inventory>('talent-inventory?' + query)
      .then((result) => {
        if (!ignore) setData(result);
      })
      .catch((e) => {
        if (!ignore) setError((e as Error).message);
      });
    return () => {
      ignore = true;
    };
  }, [organizationId, source, availability, q, offset, refresh]);
  return (
    <section className="talent-workspace">
      <h2>Mi talento e inventario de derechos</h2>
      <p>La vigencia de un acuerdo no confirma que cubra el uso de una campaña.</p>
      <form
        className="talent-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(text);
          setOffset(0);
          setRefresh((n) => n + 1);
        }}
      >
        <label>
          Buscar en mi talento
          <input
            className="input"
            maxLength={100}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <label>
          Origen
          <select
            aria-label="Origen"
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setOffset(0);
            }}
          >
            <option value="all">Todos</option>
            <option value="marketplace">Marketplace</option>
            <option value="existing">Acuerdos existentes</option>
          </select>
        </label>
        <label>
          Vigencia
          <select
            aria-label="Vigencia"
            value={availability}
            onChange={(e) => {
              setAvailability(e.target.value);
              setOffset(0);
            }}
          >
            <option value="all">Todos los estados</option>
            <option value="current">Con derechos vigentes</option>
            <option value="expiring">Vencen en 30 días</option>
            <option value="not_current">Sin derechos vigentes</option>
          </select>
        </label>
        <Button type="submit">Buscar y actualizar</Button>
      </form>
      {error ? (
        <ErrorPanel message={error} />
      ) : !data ? (
        <Loading />
      ) : (
        <>
          <p className="muted">Consultado: {new Date(data.evaluated_at).toLocaleString('es-ES')}</p>
          {!data.items.length ? <p>No hay talento para estos filtros.</p> : null}
          <div className="talent-cards">
            {data.items.map((item) => (
              <article className="panel" key={item.asset_id}>
                <h3>{item.display_name}</h3>
                <p>Perfil: {labels[item.asset_status] ?? item.asset_status}</p>
                {item.pending_agreements > 0 ? (
                  <p>
                    {item.pending_agreements} acuerdo(s) pendientes de confirmación. No conceden
                    derechos.
                  </p>
                ) : null}
                {item.grants.slice(0, visibleGrants[item.asset_id] ?? 3).map((grant) => (
                  <div key={grant.id}>
                    <GrantSummary grant={grant} />
                    {onAdd ? (
                      <Button
                        disabled={disabled}
                        variant="outline"
                        onClick={() => void onAdd(item.asset_id, grant.id)}
                      >
                        Añadir con este derecho
                      </Button>
                    ) : null}
                  </div>
                ))}
                {item.grants.length > (visibleGrants[item.asset_id] ?? 3) ? (
                  <Button
                    variant="outline"
                    onClick={() =>
                      setVisibleGrants((current) => ({
                        ...current,
                        [item.asset_id]: (current[item.asset_id] ?? 3) + 3,
                      }))
                    }
                  >
                    Mostrar más derechos ({item.grants.length} en total)
                  </Button>
                ) : null}
                {onAdd ? (
                  <Button disabled={disabled} onClick={() => void onAdd(item.asset_id, null)}>
                    Añadir sin seleccionar derecho
                  </Button>
                ) : null}
              </article>
            ))}
          </div>
          <div className="campaign-tabs">
            {offset > 0 ? (
              <Button variant="outline" onClick={() => setOffset(Math.max(0, offset - 20))}>
                Anterior
              </Button>
            ) : null}
            {data.next_offset !== null ? (
              <Button variant="outline" onClick={() => setOffset(data.next_offset!)}>
                Siguiente
              </Button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
export function MyTalent() {
  const { user, loading } = useSession();
  const [selected, setSelected] = useState('');
  const orgs = user?.organizations.filter((o) => ['owner', 'employee'].includes(o.role)) ?? [];
  const org = selected || orgs[0]?.id;
  if (loading) return <Loading />;
  if (!user) return <AuthRequired />;
  return (
    <>
      <Title
        title="Mi talento"
        description="Consulta los acuerdos de tu organización y sus derechos declarados."
      />
      {org ? (
        <>
          <label>
            Organización
            <select value={org} onChange={(e) => setSelected(e.target.value)}>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.legal_name}
                </option>
              ))}
            </select>
          </label>
          <RightsInventory key={org} organizationId={org} />
        </>
      ) : (
        <Link href="/company/setup">Configurar empresa</Link>
      )}
    </>
  );
}
export function CampaignTalent({
  id,
  organizationId,
  canEdit,
  onChanged,
}: {
  id: string;
  organizationId: string;
  canEdit: boolean;
  onChanged: () => Promise<void>;
}) {
  const [data, setData] = useState<{ items: Linked[]; next_offset: number | null } | null>(null);
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [q, setQ] = useState('');
  const [market, setMarket] = useState<{
    items: { id: string; display_name: string }[];
    next_cursor: string | null;
  } | null>(null);
  const [marketQuery, setMarketQuery] = useState('');
  useEffect(() => {
    let ignore = false;
    setData(null);
    void api<{ items: Linked[]; next_offset: number | null }>(
      `campaigns/${id}/talent?offset=${offset}`,
    )
      .then((result) => {
        if (!ignore) setData(result);
      })
      .catch((e) => {
        if (!ignore) setError((e as Error).message);
      });
    return () => {
      ignore = true;
    };
  }, [id, offset, refresh]);
  async function change(asset: string, grant: string | null, remove = false) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api(`campaigns/${id}/talent${remove ? `/${asset}/remove` : ''}`, {
        method: 'POST',
        body: remove ? {} : { asset_id: asset, selected_grant_id: grant },
      });
      setRefresh((n) => n + 1);
      await onChanged();
      setNotice(
        remove
          ? 'Talento retirado de la campaña. Sus derechos se conservan.'
          : 'Talento vinculado. Derechos de campaña sin evaluar.',
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function searchMarket(cursor?: string) {
    setBusy(true);
    setError('');
    try {
      const search = cursor ? marketQuery : q;
      const query = new URLSearchParams({ q: search, limit: '20', ...(cursor ? { cursor } : {}) });
      setMarket(await api('search?' + query));
      setMarketQuery(search);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="talent-workspace">
      <h2>Talento de la campaña</h2>
      <p>Vincular talento organiza la campaña. No concede permisos ni autoriza generación.</p>
      {error ? <ErrorPanel message={error} /> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {!data && !error ? <Loading /> : null}
      {data ? (
        <>
          <div className="talent-cards">
            {data.items.map((item) => (
              <article className="panel" key={item.asset_id}>
                <h3>{item.display_name}</h3>
                <p>Perfil: {labels[item.asset_status] ?? item.asset_status}</p>
                {item.selected_grant ? (
                  <GrantSummary grant={item.selected_grant} />
                ) : (
                  <p>Sin derecho seleccionado.</p>
                )}
                {canEdit ? (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void change(item.asset_id, null, true)}
                  >
                    Retirar de campaña
                  </Button>
                ) : null}
              </article>
            ))}
          </div>
          {!data.items.length ? <p>No hay talento vinculado en esta página.</p> : null}
          <div className="campaign-tabs">
            {offset > 0 ? (
              <Button variant="outline" onClick={() => setOffset(Math.max(0, offset - 20))}>
                Talento anterior
              </Button>
            ) : null}
            {data.next_offset !== null ? (
              <Button variant="outline" onClick={() => setOffset(data.next_offset!)}>
                Más talento vinculado
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
      {canEdit ? (
        <>
          <RightsInventory
            organizationId={organizationId}
            onAdd={(asset, grant) => change(asset, grant)}
            disabled={busy}
          />
          <section className="panel">
            <h2>Añadir desde marketplace</h2>
            <p>Perfiles publicados disponibles para solicitar una licencia.</p>
            <form
              className="talent-filters"
              onSubmit={(e) => {
                e.preventDefault();
                void searchMarket();
              }}
            >
              <label>
                Buscar en marketplace
                <input
                  className="input"
                  value={q}
                  maxLength={100}
                  onChange={(e) => setQ(e.target.value)}
                />
              </label>
              <Button disabled={busy} type="submit">
                Buscar talento publicado
              </Button>
            </form>
            {market ? (
              <>
                <div className="talent-cards">
                  {market.items.map((item) => (
                    <article key={item.id}>
                      <h3>{item.display_name}</h3>
                      <p>La publicación no concede derechos a tu organización.</p>
                      <Button disabled={busy} onClick={() => void change(item.id, null)}>
                        Añadir talento
                      </Button>
                    </article>
                  ))}
                </div>
                {!market.items.length ? (
                  <p>No hay perfiles publicados para esta búsqueda.</p>
                ) : null}
                {market.next_cursor ? (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void searchMarket(market.next_cursor!)}
                  >
                    Más perfiles
                  </Button>
                ) : null}
              </>
            ) : null}
          </section>
        </>
      ) : (
        <p>Acceso de lectura. El propietario puede añadir o retirar talento.</p>
      )}
    </div>
  );
}
