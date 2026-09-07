'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  ArrowRight,
  FileCheck2,
  FolderOpen,
  Clock3,
  Plus,
  Download,
  ShieldCheck,
  CheckCircle2,
  CreditCard,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react';
import { api, money, date } from '@/lib/api';
import type { Order, License, LicenseRequest, RightsPolicy } from '@/lib/types';
import { useSession } from './session';
import { Button } from './ui/button';
import { Title, Badge, Loading, ErrorPanel, Empty, AuthRequired, SandboxNote } from './common';

function licenseTermsVersion(order: Order): string {
  const snap = order.policy_snapshot;
  if (snap && 'license_terms_version' in snap && (snap as RightsPolicy).license_terms_version) {
    return (snap as RightsPolicy).license_terms_version;
  }
  return 'v1.0';
}

function usageLabel(scope: Order['scope']): string {
  const parts = [
    scope.purpose,
    scope.industry ?? scope.category,
    scope.generation_type ?? scope.operation,
  ].filter(Boolean);
  return parts.join(' · ') || '—';
}
export function Company({ licensesOnly = false }: { licensesOnly?: boolean }) {
  const { user, loading: sessionLoading, toast } = useSession(),
    router = useRouter(),
    [orders, setOrders] = useState<Order[]>([]),
    [requests, setRequests] = useState<LicenseRequest[]>([]),
    [licenses, setLicenses] = useState<License[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [busy, setBusy] = useState('');
  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [o, r, l] = await Promise.all([
        api<Order[]>('orders'),
        api<LicenseRequest[]>('license-requests'),
        api<License[]>('licenses'),
      ]);
      setOrders(o);
      setRequests(r);
      setLicenses(l);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [user]);
  useEffect(() => {
    void load();
  }, [load]);
  if (sessionLoading) return <Loading />;
  if (!user) return <AuthRequired />;
  async function continueRequest(id: string) {
    setBusy(id);
    try {
      const q = await api<{ id: string }>('quotes', { method: 'POST', body: { request_id: id } });
      const o = await api<{ id: string }>('orders', { method: 'POST', body: { quote_id: q.id } });
      router.push('/company/orders/' + o.id);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  return (
    <>
      <Title
        eyebrow="TU ESPACIO DE MARCA"
        title={licensesOnly ? 'Cada permiso, en su lugar.' : 'De la idea a la campaña.'}
        description={
          licensesOnly
            ? 'Consulta el alcance, las fechas y la verificación de tus licencias.'
            : 'Gestiona solicitudes, contratos y licencias desde tu workspace.'
        }
        action={
          <Button asChild>
            <Link href="/discover">
              <Plus size={16} />
              Nueva campaña
            </Link>
          </Button>
        }
      />
      <div className="stats-grid">
        <div className="stat">
          <span>
            <FolderOpen size={18} />
            Campañas creadas
          </span>
          <b>{orders.length}</b>
          <small>Órdenes de tu workspace</small>
        </div>
        <div className="stat">
          <span>
            <FileCheck2 size={18} />
            Licencias emitidas
          </span>
          <b>{licenses.length}</b>
          <small>Con certificado firmado</small>
        </div>
        <div className="stat">
          <span>
            <Clock3 size={18} />
            Por aprobar
          </span>
          <b>{requests.filter((r) => r.decision === 'REQUIRES_APPROVAL').length}</b>
          <small>Esperando al creador</small>
        </div>
        <div className="stat">
          <span>
            <CreditCard size={18} />
            Importe de prueba
          </span>
          <b>
            {money(
              orders
                .filter((o) => o.status === 'fulfilled')
                .reduce((s, o) => s + o.price.total_minor, 0),
            )}
          </b>
          <small>No se ha movido dinero real</small>
        </div>
      </div>
      {error ? (
        <ErrorPanel message={error} retry={() => void load()} />
      ) : loading ? (
        <Loading />
      ) : licensesOnly ? (
        <>
          {licenses.length ? (
            <div className="license-grid">
              {licenses.map((l) => (
                <article className="license-card" key={l.id}>
                  <div className="license-card-top">
                    <ShieldCheck size={28} />
                    <Badge value={l.verification_status} />
                  </div>
                  <span className="eyebrow">DIGITAL LIKENESS LICENSE</span>
                  <h2>{l.display_name}</h2>
                  <p>{l.scope.campaign_name}</p>
                  <dl>
                    <div>
                      <dt>Territorios</dt>
                      <dd>{(l.scope.territories ?? []).join(', ')}</dd>
                    </div>
                    <div>
                      <dt>Vigencia</dt>
                      <dd>
                        {date(l.starts_at)} — {date(l.ends_at)}
                      </dd>
                    </div>
                    <div>
                      <dt>Canales</dt>
                      <dd>{(l.scope.channels ?? []).join(', ')}</dd>
                    </div>
                  </dl>
                  <div className="license-card-actions">
                    <Button variant="outline" asChild>
                      <Link href={'/verify/' + l.public_token}>
                        Verificar
                        <ArrowUpRight size={16} />
                      </Link>
                    </Button>
                    <a
                      href={'/api/licenses/' + l.id + '/certificate'}
                      className="icon-action"
                      aria-label="Descargar certificado JSON"
                    >
                      <Download size={19} />
                    </a>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title="Tus permisos empiezan aquí"
              description="Cuando completes tu primera compra de prueba, encontrarás aquí su licencia firmada."
              href="/discover"
            />
          )}
        </>
      ) : (
        <>
          <div className="section-heading">
            <div>
              <span className="section-number">01 /</span>
              <h2>Mis campañas</h2>
            </div>
            <Button variant="ghost" size="sm" onClick={() => void load()}>
              <RefreshCw size={14} />
              Actualizar
            </Button>
          </div>
          {orders.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Campaña / talento</th>
                    <th>Duración</th>
                    <th>Importe</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <b>{o.scope.campaign_name}</b>
                        <small>{o.display_name}</small>
                      </td>
                      <td>{o.scope.duration_days} días</td>
                      <td>{money(o.price.total_minor)}</td>
                      <td>
                        <Badge value={o.status} />
                      </td>
                      <td>
                        <Link className="table-link" href={'/company/orders/' + o.id}>
                          Ver detalle
                          <ArrowUpRight size={16} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="La próxima gran idea empieza contigo"
              description="Selecciona un creador y configura el uso para crear tu primera campaña de prueba."
              href="/discover"
            />
          )}
          <div className="section-heading spaced">
            <div>
              <span className="section-number">02 /</span>
              <h2>Solicitudes de derechos</h2>
            </div>
          </div>
          {requests.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Campaña</th>
                    <th>Creador</th>
                    <th>Decisión</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <b>{r.usage.campaign_name}</b>
                        <small>{date(r.created_at)}</small>
                      </td>
                      <td>{r.display_name}</td>
                      <td>
                        <Badge value={r.decision} />
                      </td>
                      <td>
                        {r.decision === 'ALLOW' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === r.id}
                            onClick={() => void continueRequest(r.id)}
                          >
                            Continuar
                            <ArrowRight size={14} />
                          </Button>
                        ) : r.decision === 'REQUIRES_APPROVAL' ? (
                          <small className="muted">Esperando al creador</small>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">Todavía no hay solicitudes.</p>
          )}
        </>
      )}
      <SandboxNote />
    </>
  );
}
export function OrderDetail({ id, paymentPage = false }: { id: string; paymentPage?: boolean }) {
  const { user, loading: sessionLoading, toast } = useSession(),
    router = useRouter(),
    [order, setOrder] = useState<Order | null>(null),
    [error, setError] = useState(''),
    [accepted, setAccepted] = useState(false),
    [showFullTerms, setShowFullTerms] = useState(false),
    [busy, setBusy] = useState(false),
    [payments, setPayments] = useState<'sandbox' | 'stripe' | string>('sandbox');
  const load = useCallback(async () => {
    try {
      const [o, cfg] = await Promise.all([
        api<Order>('orders/' + id),
        api<{ payments?: string }>('config'),
      ]);
      setOrder(o);
      setPayments(cfg.payments ?? 'sandbox');
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    if (user) void load();
  }, [user, load]);
  useEffect(() => {
    if (order && ['payment_processing', 'paid', 'issuing'].includes(order.status)) {
      const timer = setInterval(() => void load(), 1500);
      return () => clearInterval(timer);
    }
  }, [order, load]);
  // Stripe: if we landed on the local checkout page, resume hosted Checkout immediately.
  useEffect(() => {
    if (!paymentPage || !order || payments !== 'stripe') return;
    if (order.status !== 'payment_processing' && order.status !== 'awaiting_payment') return;
    let cancelled = false;
    void (async () => {
      try {
        const checkout = await api<{ url?: string; processing?: boolean }>(
          'orders/' + id + '/checkout',
          { method: 'POST', body: {} },
        );
        if (cancelled) return;
        if (checkout.url && !checkout.url.startsWith('/')) {
          window.location.assign(checkout.url);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paymentPage, order?.status, payments, id]);
  if (sessionLoading) return <Loading />;
  if (!user) return <AuthRequired />;
  if (!order) return error ? <ErrorPanel message={error} /> : <Loading />;
  const o = order;
  const stripeMode = payments === 'stripe';
  async function pay() {
    setBusy(true);
    setError('');
    try {
      if (o.status === 'awaiting_acceptance')
        await api('orders/' + id + '/acceptance', {
          method: 'POST',
          body: { accepted: true, document_hash: o.contract_hash },
        });
      const checkout = await api<{ url?: string }>('orders/' + id + '/checkout', {
        method: 'POST',
        body: {},
      });
      if (checkout.url) {
        if (checkout.url.startsWith('/')) router.push(checkout.url);
        else window.location.assign(checkout.url);
      } else await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function simulate(success: boolean) {
    setBusy(true);
    setError('');
    try {
      await api('orders/' + id + '/simulate-payment', { method: 'POST', body: { success } });
      toast(
        success
          ? 'Pago simulado recibido. Preparando la licencia…'
          : 'Pago rechazado de prueba. Puedes volver a intentarlo.',
      );
      router.push('/company/orders/' + id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link href="/company" className="back-link">
        <ArrowLeft size={16} />
        Mis campañas
      </Link>
      <Title
        eyebrow={paymentPage ? 'PASO 3 · PAGO' : 'PASO 3 · LICENCIA'}
        title={paymentPage ? 'Pago de la licencia' : o.scope.campaign_name}
        description={'Licencia de likeness · ' + (o.creator_name ?? o.display_name)}
        action={<Badge value={o.status} />}
      />
      <div className="order-layout">
        <section className="panel">
          <div className="panel-header">
            <FileCheck2 size={22} />
            <h2>{paymentPage ? 'Pago' : 'Resumen de licencia'}</h2>
          </div>
          {paymentPage ? (
            <>
              <p className="muted">
                {stripeMode
                  ? 'Te redirigimos a Stripe Checkout (modo test). Usa la tarjeta 4242…'
                  : 'Este checkout simula un pago. No introduzcas datos bancarios.'}
              </p>
              <dl className="summary-list">
                <div>
                  <dt>Creador</dt>
                  <dd>{o.creator_name}</dd>
                </div>
                <div>
                  <dt>Campaña</dt>
                  <dd>{o.scope.campaign_name}</dd>
                </div>
                <div>
                  <dt>Inicio</dt>
                  <dd>{date(o.scope.starts_at)}</dd>
                </div>
                <div>
                  <dt>Duración</dt>
                  <dd>{o.scope.duration_days} días</dd>
                </div>
                <div>
                  <dt>Territorios</dt>
                  <dd>{(o.scope.territories ?? []).join(', ')}</dd>
                </div>
                <div>
                  <dt>Canales</dt>
                  <dd>{(o.scope.channels ?? []).join(', ')}</dd>
                </div>
              </dl>
              <div className="demo-payment">
                <CreditCard size={32} />
                <div>
                  <b>{stripeMode ? 'Pago Stripe test' : 'Pago sandbox'}</b>
                  <p>
                    {stripeMode
                      ? 'Checkout alojado · tarjeta de prueba 4242'
                      : 'Sin tarjeta. Sin cargo real.'}
                  </p>
                </div>
                <span>{stripeMode ? 'STRIPE' : 'TEST'}</span>
              </div>
            </>
          ) : (
            <>
              <dl className="summary-list license-summary-list">
                <div>
                  <dt>Licenciatario</dt>
                  <dd>{o.organization_legal_name ?? '—'}</dd>
                </div>
                <div>
                  <dt>Creador</dt>
                  <dd>{o.creator_name ?? o.display_name}</dd>
                </div>
                <div>
                  <dt>Uso</dt>
                  <dd>{usageLabel(o.scope)}</dd>
                </div>
                <div>
                  <dt>Territorio</dt>
                  <dd>{(o.scope.territories ?? []).join(', ') || '—'}</dd>
                </div>
                <div>
                  <dt>Canales</dt>
                  <dd>{(o.scope.channels ?? []).join(', ') || '—'}</dd>
                </div>
                <div>
                  <dt>Duración</dt>
                  <dd>
                    {o.scope.duration_days} días
                    {o.scope.starts_at ? ` · desde ${date(o.scope.starts_at)}` : ''}
                  </dd>
                </div>
                <div>
                  <dt>Precio</dt>
                  <dd>{money(o.price.total_minor)}</dd>
                </div>
              </dl>
              <p className="license-accept-copy">
                Al continuar, aceptas la <strong>Licencia de likeness digital</strong> (
                {licenseTermsVersion(o)}).
              </p>
              <button
                type="button"
                className="terms-toggle"
                onClick={() => setShowFullTerms((v) => !v)}
                aria-expanded={showFullTerms}
              >
                {showFullTerms ? 'Ocultar términos completos' : 'Ver términos completos'}
              </button>
              {showFullTerms ? (
                <div className="full-terms">
                  <pre className="contract-text">{o.contract_text}</pre>
                  <p className="hash-label">
                    SHA-256 <code>{o.contract_hash}</code>
                  </p>
                </div>
              ) : null}
            </>
          )}
        </section>
        <aside className="panel order-summary">
          <h2>Tu campaña, con permiso.</h2>
          <dl className="summary-list">
            <div>
              <dt>Licencia</dt>
              <dd>{money(o.price.total_minor)}</dd>
            </div>
            <div>
              <dt>Para el creador</dt>
              <dd>{money(o.price.creator_minor)}</dd>
            </div>
            <div>
              <dt>Comisión incluida</dt>
              <dd>{money(o.price.fee_minor)}</dd>
            </div>
          </dl>
          <div className="price-total">
            <span>Total de prueba</span>
            <b>{money(o.price.total_minor)}</b>
          </div>
          <p className="muted small">
            Fiscalidad pendiente de configuración. Documento DEMO sin derechos reales.
          </p>
          {error ? (
            <p role="alert" className="inline-error">
              {error}
            </p>
          ) : null}
          {o.license ? (
            <div className="success-block">
              <CheckCircle2 size={36} />
              <h3>Licencia emitida</h3>
              <p>El certificado ya está firmado. Su vigencia comienza en la fecha acordada.</p>
              <Button asChild>
                <Link href={'/verify/' + o.license.public_token}>
                  Verificar licencia
                  <ArrowUpRight size={16} />
                </Link>
              </Button>
              <a className="download-link" href={'/api/licenses/' + o.license.id + '/certificate'}>
                <Download size={15} />
                Descargar certificado JSON
              </a>
            </div>
          ) : paymentPage && o.status === 'payment_processing' && !stripeMode ? (
            <>
              <Button className="full-width" disabled={busy} onClick={() => void simulate(true)}>
                {busy ? 'Procesando…' : 'Simular pago correcto'}
                <ArrowRight size={16} />
              </Button>
              <Button
                variant="ghost"
                className="full-width"
                disabled={busy}
                onClick={() => void simulate(false)}
              >
                Probar pago rechazado
              </Button>
            </>
          ) : paymentPage && o.status === 'payment_processing' && stripeMode ? (
            <>
              <p className="muted">
                Si no se abre Stripe solo, pulsa el botón. Tarjeta test: 4242 4242 4242 4242.
              </p>
              <Button className="full-width" disabled={busy} onClick={() => void pay()}>
                {busy ? 'Abriendo Stripe…' : 'Continuar en Stripe Checkout'}
                <ArrowRight size={16} />
              </Button>
            </>
          ) : ['awaiting_acceptance', 'awaiting_payment'].includes(o.status) ? (
            <>
              {o.status === 'awaiting_acceptance' ? (
                <label className="acceptance">
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={(e) => setAccepted(e.target.checked)}
                  />
                  <span>Acepto los términos de la licencia.</span>
                </label>
              ) : null}
              <Button
                className="full-width"
                disabled={busy || (o.status === 'awaiting_acceptance' && !accepted)}
                onClick={() => void pay()}
              >
                {busy
                  ? 'Preparando checkout…'
                  : stripeMode
                    ? 'Pagar con Stripe (test)'
                    : 'Continuar al pago'}
                <ArrowRight size={16} />
              </Button>
            </>
          ) : o.status === 'payment_processing' ? (
            <>
              <p className="muted">
                {stripeMode
                  ? 'Completa el pago en Stripe Checkout para emitir tu licencia.'
                  : 'Completa el pago de prueba para emitir tu licencia.'}
              </p>
              <Button className="full-width" disabled={busy} onClick={() => void pay()}>
                {busy
                  ? 'Abriendo…'
                  : stripeMode
                    ? 'Continuar en Stripe Checkout'
                    : 'Abrir checkout'}
                <ArrowRight size={16} />
              </Button>
            </>
          ) : ['paid', 'issuing'].includes(o.status) ? (
            <Loading />
          ) : (
            <p className="muted">Esta orden requiere seguimiento desde administración.</p>
          )}
          <p className="config-footnote">
            <ShieldCheck size={15} />
            Política y contrato versionados
          </p>
        </aside>
      </div>
      <SandboxNote />
    </>
  );
}
