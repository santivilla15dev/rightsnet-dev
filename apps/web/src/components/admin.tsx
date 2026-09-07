'use client';
import { useEffect, useState, useCallback } from 'react';
import {
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Scale,
  Activity,
  ArrowUpRight,
} from 'lucide-react';
import { api, money, date } from '@/lib/api';
import type { Asset, Order } from '@/lib/types';
import { useSession } from './session';
import { Button } from './ui/button';
import { Dialog } from './ui/dialog';
import { Title, Badge, Loading, ErrorPanel, AuthRequired, SandboxNote } from './common';
import Link from 'next/link';
type AdminData = {
  assets: Asset[];
  events: { id: string; action: string; resource_id: string; created_at: string }[];
  orders: Order[];
  incidents: { id: string; category: string; details: string; status: string }[];
  journals: {
    id: string;
    kind: string;
    order_id: string;
    entries: { account: string; side: string; amount_minor: string }[];
  }[];
  organizations: { id: string; legal_name: string; verified: boolean }[];
  outbox: { id: string; status: string; last_error: string }[];
  transfers: {
    id: string;
    provider_ref: string;
    amount_minor: number;
    status: string;
    connected_account_ref: string;
    order_id: string | null;
    creator_name?: string;
  }[];
  disputes: {
    id: string;
    provider_ref: string;
    amount_minor: number;
    status: string;
    review_status: string;
    order_id: string | null;
    license_status?: string;
  }[];
  payouts: {
    id: string;
    provider_payout_id: string;
    amount_minor: number;
    status: string;
    connected_account_ref: string;
  }[];
  money_note?: string;
};
export function Admin() {
  const { user, loading: sessionLoading, toast } = useSession(),
    [data, setData] = useState<AdminData | null>(null),
    [error, setError] = useState(''),
    [tab, setTab] = useState('overview'),
    [busy, setBusy] = useState(''),
    [reason, setReason] = useState(''),
    [pending, setPending] = useState<{
      path: string;
      title: string;
      body: Record<string, string>;
    } | null>(null),
    [recon, setRecon] = useState<string>(''),
    [external, setExternal] = useState<{
      balance_transactions_imported: number;
      open_differences: {
        id: string;
        kind: string;
        severity: string;
        provider_ref: string | null;
        local_ref: string | null;
        amount_minor: number | null;
        detail: string;
        status: string;
      }[];
      recent_runs: {
        id: string;
        status: string;
        imported_count: number;
        difference_count: number;
        recovered_events: number;
        started_at: string;
      }[];
    } | null>(null);
  const load = useCallback(async () => {
    if (user?.role !== 'admin') return;
    try {
      setData(await api<AdminData>('admin/overview'));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [user]);
  const loadExternal = useCallback(async () => {
    if (user?.role !== 'admin') return;
    try {
      setExternal(
        await api('admin/reconciliation/external'),
      );
    } catch {
      // Sandbox sin Stripe: el estado externo puede no estar disponible.
      setExternal(null);
    }
  }, [user]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (tab === 'ledger') void loadExternal();
  }, [tab, loadExternal]);
  if (sessionLoading) return <Loading />;
  if (!user) return <AuthRequired />;
  if (user.role !== 'admin')
    return (
      <ErrorPanel message="No tienes permiso de administración. Si necesitas operar la plataforma, usa una cuenta con rol admin." />
    );
  if (!data) return error ? <ErrorPanel message={error} /> : <Loading />;
  const d = data;
  async function execute(e: React.FormEvent) {
    e.preventDefault();
    if (!pending) return;
    setBusy(pending.path);
    try {
      await api(pending.path, {
        method: 'POST',
        body: pending.path.includes('/disputes/')
          ? { ...pending.body, note: reason }
          : { ...pending.body, reason },
      });
      toast('Acción registrada en la auditoría.');
      setPending(null);
      setReason('');
      await load();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  return (
    <>
      <Title
        eyebrow="CONTROL ROOM"
        title="Confianza, por diseño."
        description="Verificación, operaciones y trazabilidad de principio a fin."
        action={
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw size={16} />
            Actualizar
          </Button>
        }
      />
      <div className="stats-grid">
        <div className="stat">
          <span>
            <ShieldCheck size={18} />
            Por revisar
          </span>
          <b>{d.assets.filter((a) => a.status === 'pending_review').length}</b>
          <small>Perfiles esperando revisión</small>
        </div>
        <div className="stat">
          <span>
            <Activity size={18} />
            Órdenes
          </span>
          <b>{d.orders.length}</b>
          <small>Recorrido económico de prueba</small>
        </div>
        <div className="stat">
          <span>
            <AlertCircle size={18} />
            Incidencias abiertas
          </span>
          <b>{d.incidents.filter((i) => i.status === 'open').length}</b>
          <small>Seguimiento operativo</small>
        </div>
        <div className="stat">
          <span>
            <Scale size={18} />
            Disputas abiertas
          </span>
          <b>{(d.disputes ?? []).filter((x) => ['open', 'escalated'].includes(x.review_status)).length}</b>
          <small>Sin revocar licencia automáticamente</small>
        </div>
      </div>
      <div className="category-tabs admin-tabs">
        {[
          ['overview', 'Verificación'],
          ['orders', 'Pagos y licencias'],
          ['money', 'Transfer / disputa / payout'],
          ['ledger', 'Ledger'],
          ['audit', 'Auditoría'],
          ['incidents', 'Incidencias'],
        ].map(([v, l]) => (
          <button key={v} className={tab === v ? 'selected' : ''} onClick={() => setTab(v)}>
            {l}
          </button>
        ))}
      </div>
      {error ? <ErrorPanel message={error} /> : null}
      {tab === 'overview' ? (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Creador</th>
                  <th>Identidad</th>
                  <th>Estado</th>
                  <th>Revisión</th>
                </tr>
              </thead>
              <tbody>
                {d.assets.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <b>{a.display_name}</b>
                      <small>
                        {a.location} · Política v{a.policy_version}
                      </small>
                    </td>
                    <td>
                      <Badge value={a.identity_status} />
                    </td>
                    <td>
                      <Badge value={a.status} />
                    </td>
                    <td>
                      <div className="inline-actions">
                        {a.status === 'pending_review' ? (
                          <>
                            <Button
                              size="sm"
                              onClick={() =>
                                setPending({
                                  path: 'admin/assets/' + a.id + '/review',
                                  title: 'Aprobar revisión de prueba: ' + a.display_name,
                                  body: { decision: 'approve' },
                                })
                              }
                            >
                              Aprobar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setPending({
                                  path: 'admin/assets/' + a.id + '/review',
                                  title: 'Rechazar perfil',
                                  body: { decision: 'reject' },
                                })
                              }
                            >
                              Rechazar
                            </Button>
                          </>
                        ) : a.status === 'published' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setPending({
                                path: 'admin/assets/' + a.id + '/suspend',
                                title: 'Suspender nuevas ventas de ' + a.display_name,
                                body: {},
                              })
                            }
                          >
                            Suspender ventas
                          </Button>
                        ) : (
                          <span className="muted">Pendiente del creador</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2 className="subheading">Organizaciones</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {d.organizations.map((o) => (
                  <tr key={o.id}>
                    <td>{o.legal_name}</td>
                    <td>{o.verified ? 'Revisada en sandbox' : 'Pendiente'}</td>
                    <td>
                      {!o.verified ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setPending({
                              path: 'admin/organizations/' + o.id + '/verify',
                              title: 'Verificar organización de prueba',
                              body: {},
                            })
                          }
                        >
                          Verificar
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : tab === 'orders' ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Campaña</th>
                <th>Importe</th>
                <th>Estado</th>
                <th>Operar</th>
              </tr>
            </thead>
            <tbody>
              {d.orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <b>{o.scope.campaign_name}</b>
                    <small>{o.display_name}</small>
                  </td>
                  <td>{money(o.price.total_minor)}</td>
                  <td>
                    <Badge value={o.status} />
                  </td>
                  <td>
                    <div className="inline-actions">
                      {['fulfilled', 'paid', 'paid_requires_review'].includes(o.status) ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setPending({
                              path: 'admin/orders/' + o.id + '/refund',
                              title: 'Reembolsar pago de prueba. La licencia conserva su estado.',
                              body: {},
                            })
                          }
                        >
                          Reembolsar
                        </Button>
                      ) : null}
                      {o.license_id && o.license_status !== 'revoked' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setPending({
                              path: 'admin/licenses/' + o.license_id + '/status',
                              title:
                                'Cambiar estado de licencia: documenta el fundamento contractual',
                              body: {
                                status: o.license_status === 'suspended' ? 'issued' : 'suspended',
                              },
                            })
                          }
                        >
                          {o.license_status === 'suspended' ? 'Reactivar' : 'Suspender licencia'}
                        </Button>
                      ) : null}
                      <Link href={'/company/orders/' + o.id} aria-label="Ver orden">
                        <ArrowUpRight size={17} />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!d.orders.length ? <p className="table-empty">Todavía no hay órdenes.</p> : null}
        </div>
      ) : tab === 'money' ? (
        <>
          <p className="muted">{d.money_note ?? 'Los payouts bancarios no se atribuyen a una sola orden.'}</p>
          <div className="section-heading spaced">
            <div>
              <span className="section-number">T /</span>
              <h2>Transferencias al creador</h2>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cuenta</th>
                  <th>Importe</th>
                  <th>Estado</th>
                  <th>Orden</th>
                </tr>
              </thead>
              <tbody>
                {(d.transfers ?? []).map((t) => (
                  <tr key={t.id}>
                    <td>
                      <b>{t.creator_name ?? t.connected_account_ref}</b>
                      <small>{t.provider_ref}</small>
                    </td>
                    <td>{money(t.amount_minor)}</td>
                    <td>
                      <Badge value={t.status} />
                    </td>
                    <td>
                      <small>{t.order_id ? t.order_id.slice(0, 8) + '…' : 'sin vincular'}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!(d.transfers ?? []).length ? (
              <p className="table-empty">Sin transferencias Stripe registradas.</p>
            ) : null}
          </div>
          <div className="section-heading spaced">
            <div>
              <span className="section-number">D /</span>
              <h2>Disputas</h2>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Disputa</th>
                  <th>Importe</th>
                  <th>Stripe</th>
                  <th>Revisión</th>
                  <th>Operar</th>
                </tr>
              </thead>
              <tbody>
                {(d.disputes ?? []).map((x) => (
                  <tr key={x.id}>
                    <td>
                      <b>{x.provider_ref}</b>
                      <small>
                        Licencia: {x.license_status ?? 'n/a'} (no se revoca sola)
                      </small>
                    </td>
                    <td>{money(x.amount_minor)}</td>
                    <td>
                      <Badge value={x.status} />
                    </td>
                    <td>
                      <Badge value={x.review_status} />
                    </td>
                    <td>
                      {['open', 'escalated'].includes(x.review_status) ? (
                        <div className="inline-actions">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setPending({
                                path: 'admin/disputes/' + x.id + '/review',
                                title: 'Registrar revisión humana de la disputa (sin revocar licencia).',
                                body: { decision: 'acknowledge' },
                              })
                            }
                          >
                            Acusar recibo
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setPending({
                                path: 'admin/disputes/' + x.id + '/review',
                                title: 'Escalar disputa a revisión operativa.',
                                body: { decision: 'escalate' },
                              })
                            }
                          >
                            Escalar
                          </Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!(d.disputes ?? []).length ? (
              <p className="table-empty">Sin disputas registradas.</p>
            ) : null}
          </div>
          <div className="section-heading spaced">
            <div>
              <span className="section-number">P /</span>
              <h2>Payouts bancarios</h2>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cuenta conectada</th>
                  <th>Importe</th>
                  <th>Estado</th>
                  <th>Stripe payout</th>
                </tr>
              </thead>
              <tbody>
                {(d.payouts ?? []).map((p) => (
                  <tr key={p.id}>
                    <td>{p.connected_account_ref}</td>
                    <td>{money(p.amount_minor)}</td>
                    <td>
                      <Badge value={p.status} />
                    </td>
                    <td>
                      <small>{p.provider_payout_id}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!(d.payouts ?? []).length ? (
              <p className="table-empty">Sin payouts bancarios. No se imputan a una orden.</p>
            ) : null}
          </div>
        </>
      ) : tab === 'ledger' ? (
        <>
          <div className="panel ledger-intro">
            <div>
              <h2>Dos controles distintos</h2>
              <p>
                <b>Conciliar ledger</b> solo revisa nuestro cuaderno interno (débitos = créditos).
                No habla con Stripe.
              </p>
              <p>
                <b>Conciliar Stripe</b> importa el extracto de Stripe (balance transactions),
                compara con pagos/refunds/transfers y puede recuperar webhooks perdidos. Requiere
                `PAYMENTS_PROVIDER=stripe`.
              </p>
            </div>
            <div className="inline-actions">
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    const r = await api<{
                      unbalanced: unknown[];
                      unissued: unknown[];
                      failed_events: unknown[];
                      note?: string;
                    }>('admin/reconciliation');
                    setRecon(
                      `Ledger interno: ${r.unbalanced.length} descuadres · ${r.unissued.length} órdenes pendientes · ${r.failed_events.length} eventos fallidos. No se ha llamado a Stripe.`,
                    );
                  } catch (e) {
                    toast((e as Error).message);
                  }
                }}
              >
                <Scale size={16} />
                Conciliar ledger
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    const r = await api<{
                      imported_count: number;
                      difference_count: number;
                      recovered_events: number;
                    }>('admin/reconciliation/external', {
                      method: 'POST',
                      body: { recover_events: true },
                    });
                    setRecon(
                      `Stripe: ${r.imported_count} movimientos importados · ${r.difference_count} diferencias · ${r.recovered_events} eventos recuperados.`,
                    );
                    await load();
                    await loadExternal();
                  } catch (e) {
                    toast((e as Error).message);
                  }
                }}
              >
                Conciliar Stripe
              </Button>
            </div>
          </div>
          {recon ? (
            <p className="reconciliation" role="status">
              <CheckCircle2 size={18} />
              {recon}
            </p>
          ) : null}
          {external ? (
            <div className="panel">
              <h3>Estado de conciliación Stripe</h3>
              <p className="muted">
                {external.balance_transactions_imported} balance transactions guardadas.
                {external.recent_runs[0]
                  ? ` Última corrida: ${external.recent_runs[0].status} · ${external.recent_runs[0].difference_count} diferencias.`
                  : ' Aún no hay corridas.'}
              </p>
              {(external.open_differences ?? []).length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Tipo</th>
                        <th>Detalle</th>
                        <th>Importe</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {external.open_differences.map((diff) => (
                        <tr key={diff.id}>
                          <td>
                            <b>{diff.kind}</b>
                            <small>{diff.severity}</small>
                          </td>
                          <td>
                            {diff.detail}
                            <small>
                              {[diff.provider_ref, diff.local_ref].filter(Boolean).join(' · ')}
                            </small>
                          </td>
                          <td>{diff.amount_minor != null ? money(diff.amount_minor) : '—'}</td>
                          <td>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                try {
                                  await api('admin/reconciliation/differences/' + diff.id + '/ack', {
                                    method: 'POST',
                                    body: {
                                      reason: 'Revisado en panel admin; sin acción monetaria automática.',
                                    },
                                  });
                                  toast('Diferencia marcada como revisada.');
                                  await loadExternal();
                                } catch (e) {
                                  toast((e as Error).message);
                                }
                              }}
                            >
                              Marcar revisada
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="table-empty">Sin diferencias abiertas.</p>
              )}
            </div>
          ) : (
            <p className="muted">
              El estado Stripe aparece cuando `PAYMENTS_PROVIDER=stripe` y hay datos importados.
            </p>
          )}
          {d.journals.map((j) => (
            <div className="journal" key={j.id}>
              <div>
                <b>{j.kind}</b>
                <small>Orden {j.order_id.slice(0, 8)}</small>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Cuenta</th>
                    <th>Débito</th>
                    <th>Crédito</th>
                  </tr>
                </thead>
                <tbody>
                  {j.entries.map((e, i) => (
                    <tr key={i}>
                      <td>{e.account}</td>
                      <td>{e.side === 'debit' ? money(Number(e.amount_minor)) : '—'}</td>
                      <td>{e.side === 'credit' ? money(Number(e.amount_minor)) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </>
      ) : tab === 'audit' ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Evento</th>
                <th>Referencia</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {d.events.map((e) => (
                <tr key={e.id}>
                  <td>
                    <code>{e.action}</code>
                  </td>
                  <td>
                    <code>{e.resource_id.slice(0, 12)}</code>
                  </td>
                  <td>{date(e.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Categoría</th>
                <th>Detalle</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {d.incidents.map((i) => (
                <tr key={i.id}>
                  <td>{i.category}</td>
                  <td>{i.details}</td>
                  <td>{i.status}</td>
                  <td>
                    {i.status === 'open' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setPending({
                            path: 'admin/incidents/' + i.id + '/resolve',
                            title: 'Resolver incidencia',
                            body: {},
                          })
                        }
                      >
                        Resolver
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!d.incidents.length ? <p className="table-empty">Sin incidencias registradas.</p> : null}
        </div>
      )}
      {pending ? (
        <Dialog onClose={() => setPending(null)}>
          <h2 id="action-title">{pending.title}</h2>
          <form onSubmit={execute}>
            <label>
              Motivo y evidencia
              <textarea
                autoFocus
                required
                minLength={10}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explica el motivo de la acción…"
              />
            </label>
            <p className="muted small">
              Esta acción se registra con tu identidad y fecha. En sandbox, las verificaciones son
              simuladas.
            </p>
            <div className="inline-actions">
              <Button type="button" variant="outline" onClick={() => setPending(null)}>
                Cancelar
              </Button>
              <Button disabled={!!busy}>Registrar acción</Button>
            </div>
          </form>
        </Dialog>
      ) : null}
      <SandboxNote />
    </>
  );
}
