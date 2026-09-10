'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, date } from '@/lib/api';
import { useSession } from './session';
import { AuthRequired, ErrorPanel, Loading, Title } from './common';
import { Button } from './ui/button';
import { CampaignClearance } from './campaign-clearance';
import { CampaignFlight } from './campaign-flight';
import { CampaignDealBuilder } from './campaign-deal-builder';
import { CampaignTalent } from './talent-inventory';

type Campaign = {
  id: string;
  organization_id: string;
  name: string;
  creative_brief: string;
  revision: number;
  updated_at: string;
  can_edit: boolean;
  activity: { action: string; created_at: string; details: { revision: number } }[];
  next_activity_offset: number | null;
};
type Listing = { items: Campaign[]; can_edit: boolean; next_offset: number | null };

export function Campaigns({ id }: { id?: string }) {
  const { user, loading, toast } = useSession();
  const router = useRouter();
  const organizations =
    user?.organizations.filter((o) => ['owner', 'employee'].includes(o.role)) ?? [];
  const [selectedOrg, setSelectedOrg] = useState('');
  const org = selectedOrg || organizations[0]?.id || '';
  const [offset, setOffset] = useState(0);
  const [listing, setListing] = useState<Listing | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [name, setName] = useState('');
  const [brief, setBrief] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('overview');
  const [activityOffset, setActivityOffset] = useState(0);
  useEffect(() => {
    if (!user || (!id && !org)) return;
    let ignore = false;
    setError('');
    setListing(null);
    setCampaign(null);
    const request = id
      ? api<Campaign>(`campaigns/${id}?offset=${activityOffset}`)
      : api<Listing>(`campaigns?organization_id=${org}&offset=${offset}`);
    void request
      .then((result) => {
        if (ignore) return;
        if ('items' in result) setListing(result);
        else {
          setCampaign(result);
          setName(result.name);
          setBrief(result.creative_brief);
        }
      })
      .catch((e) => {
        if (!ignore) setError((e as Error).message);
      });
    return () => {
      ignore = true;
    };
  }, [user, org, id, offset, activityOffset]);
  if (loading) return <Loading />;
  if (!user) return <AuthRequired />;
  if (!id && !org)
    return (
      <>
        <Title
          title="Campañas"
          description="Configura tu organización para preparar una campaña."
        />
        <Link href="/company/setup">Configurar empresa</Link>
      </>
    );

  async function save() {
    setBusy(true);
    setError('');
    try {
      const result = await api<Campaign>(id ? 'campaigns/' + id : 'campaigns', {
        method: 'POST',
        body: id
          ? { name, creative_brief: brief, expected_revision: campaign!.revision }
          : { organization_id: org, name, creative_brief: brief },
      });
      if (id) {
        const refreshed = await api<Campaign>('campaigns/' + id);
        setCampaign(refreshed);
        setName(refreshed.name);
        setBrief(refreshed.creative_brief);
        toast('Campaña guardada.');
      } else router.push('/company/campaigns/' + result.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const editor = (canEdit: boolean) => (
    <form
      className="panel campaign-editor"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h2>{id ? 'Brief creativo' : 'Crear campaña'}</h2>
      <label className="field" htmlFor="campaign-name">
        Nombre de campaña
      </label>
      <input
        id="campaign-name"
        className="input"
        required
        maxLength={120}
        value={name}
        disabled={!canEdit || busy}
        onChange={(e) => setName(e.target.value)}
      />
      <label className="field" htmlFor="campaign-brief">
        Brief creativo
      </label>
      <textarea
        id="campaign-brief"
        rows={8}
        maxLength={10000}
        value={brief}
        disabled={!canEdit || busy}
        onChange={(e) => setBrief(e.target.value)}
        placeholder="Objetivo, estilo y entregables que quieres preparar."
      />
      {canEdit ? (
        <Button type="submit" disabled={busy || !name.trim()}>
          {busy ? 'Guardando…' : id ? 'Guardar cambios' : 'Crear campaña'}
        </Button>
      ) : (
        <p>Solo el propietario puede editar esta campaña.</p>
      )}
    </form>
  );
  return (
    <>
      <Title
        eyebrow="ESPACIO DE MARCA"
        title={id ? (campaign?.name ?? 'Campaña') : 'Tus campañas'}
        description="Organiza la idea y el brief antes de seleccionar talento y solicitar derechos."
        action={<Link href="/company">Solicitudes y compras</Link>}
      />
      {error ? <ErrorPanel message={error} /> : null}
      {id ? (
        <>
          <Link href="/company/campaigns">← Todas las campañas</Link>
          {!campaign && !error ? <Loading /> : null}
          {campaign ? (
            <>
              <nav aria-label="Secciones de campaña" className="campaign-tabs">
                {(
                  [
                    ['overview', 'Resumen'],
                    ['talent', 'Talento'],
                    ['rights', 'Derechos'],
                    ['requests', 'Solicitudes'],
                    ['creative', 'Creatividad'],
                    ['production', 'Producción'],
                    ['outputs', 'Outputs'],
                    ['approvals', 'Aprobaciones'],
                    ['licenses', 'Licencias'],
                    ['activity', 'Actividad'],
                  ] as const
                ).map(([key, label]) => (
                  <Button
                    key={key}
                    variant={tab === key ? 'default' : 'outline'}
                    aria-pressed={tab === key}
                    onClick={() => setTab(key)}
                  >
                    {label}
                  </Button>
                ))}
              </nav>
              {tab === 'overview' ? (
                <section className="panel">
                  <h2>Campaña en borrador</h2>
                  <p>
                    Derechos: sin evaluar. Consulta Derechos para evaluar el uso guardado. El brief
                    no concede permisos.
                  </p>
                  <p>
                    Revisión {campaign.revision} · Actualizada {date(campaign.updated_at)}
                  </p>
                  <p className="campaign-brief">
                    {campaign.creative_brief ||
                      'Añade un brief en Creatividad para definir tu campaña.'}
                  </p>
                  <Button onClick={() => setTab('creative')}>Abrir brief</Button>
                </section>
              ) : null}
              {tab === 'talent' ? (
                <CampaignTalent
                  id={id}
                  organizationId={campaign.organization_id}
                  canEdit={campaign.can_edit}
                  onChanged={async () => {
                    const refreshed = await api<Campaign>('campaigns/' + id);
                    setCampaign(refreshed);
                  }}
                />
              ) : null}
              {tab === 'rights' ? (
                <CampaignClearance
                  id={id}
                  onChanged={async () => {
                    setCampaign(await api<Campaign>('campaigns/' + id));
                  }}
                />
              ) : null}
              {tab === 'requests' ? (
                <CampaignDealBuilder
                  id={id}
                  onChanged={async () => {
                    setCampaign(await api<Campaign>('campaigns/' + id));
                  }}
                />
              ) : null}
              {tab === 'creative' ? editor(campaign.can_edit) : null}
              {['production', 'outputs', 'approvals', 'licenses'].includes(tab) ? (
                <CampaignFlight
                  key={tab}
                  id={id}
                  section={tab}
                  onChanged={async () => {
                    setCampaign(await api<Campaign>('campaigns/' + id));
                  }}
                />
              ) : null}
              {tab === 'activity' ? (
                <section className="panel">
                  <h2>Actividad de campaña</h2>
                  <ul>
                    {campaign.activity.map((event, index) => (
                      <li key={index}>
                        {event.action === 'campaign.evidence_added'
                          ? 'Evidencia vinculada'
                          : event.action === 'campaign.evidence_removed'
                            ? 'Vínculo de evidencia retirado'
                            : event.action === 'campaign.usage_updated'
                              ? 'Uso actualizado'
                              : event.action === 'campaign.deal_request_created'
                                ? 'Solicitud creada'
                                : event.action === 'campaign.deal_request_updated'
                                  ? 'Solicitud actualizada'
                                  : event.action === 'campaign.deal_request_sent'
                                    ? 'Solicitud enviada'
                                    : event.action === 'campaign.deal_request_withdrawn'
                                      ? 'Solicitud retirada'
                                      : event.action === 'campaign.created'
                                        ? 'Campaña creada'
                                        : event.action === 'campaign.talent_added'
                                          ? 'Talento añadido'
                                          : event.action === 'campaign.talent_removed'
                                            ? 'Talento retirado'
                                            : 'Campaña actualizada'}{' '}
                        · revisión {event.details.revision} ·{' '}
                        {new Date(event.created_at).toLocaleString('es-ES')}
                      </li>
                    ))}
                  </ul>
                  {activityOffset > 0 ? (
                    <Button
                      variant="outline"
                      onClick={() => setActivityOffset(Math.max(0, activityOffset - 50))}
                    >
                      Actividad anterior
                    </Button>
                  ) : null}
                  {campaign.next_activity_offset !== null ? (
                    <Button
                      variant="outline"
                      onClick={() => setActivityOffset(campaign.next_activity_offset!)}
                    >
                      Más actividad
                    </Button>
                  ) : null}
                </section>
              ) : null}
            </>
          ) : null}
        </>
      ) : (
        <>
          <label className="field">
            Organización
            <select
              value={org}
              onChange={(e) => {
                setSelectedOrg(e.target.value);
                setOffset(0);
                setName('');
                setBrief('');
              }}
            >
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.legal_name}
                </option>
              ))}
            </select>
          </label>
          {!listing && !error ? <Loading /> : null}
          {listing ? (
            <>
              <section className="panel">
                <h2>Campañas guardadas</h2>
                {listing.items.length ? (
                  <ul>
                    {listing.items.map((item) => (
                      <li key={item.id}>
                        <Link href={'/company/campaigns/' + item.id}>{item.name}</Link> · Borrador ·{' '}
                        {date(item.updated_at)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Todavía no hay campañas en esta página.</p>
                )}
                {offset > 0 ? (
                  <Button variant="outline" onClick={() => setOffset(Math.max(0, offset - 20))}>
                    Anterior
                  </Button>
                ) : null}
                {listing.next_offset !== null ? (
                  <Button variant="outline" onClick={() => setOffset(listing.next_offset!)}>
                    Siguiente
                  </Button>
                ) : null}
              </section>
              {listing.can_edit ? (
                editor(true)
              ) : (
                <p>Acceso de lectura. El propietario puede crear campañas.</p>
              )}
            </>
          ) : null}
        </>
      )}
    </>
  );
}
