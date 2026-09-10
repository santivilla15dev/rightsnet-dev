import Link from 'next/link';
import { ArrowUpRight, Inbox, LoaderCircle, ShieldCheck } from 'lucide-react';
import { Button } from './ui/button';
import { labels } from '@/lib/api';
export function Badge({ value }: { value: string }) {
  return (
    <span
      className={
        'badge ' +
        (['DENY', 'rejected', 'REVOKED', 'SUSPENDED', 'suspended', 'INVALID'].includes(value)
          ? 'badge-red'
          : ['REQUIRES_APPROVAL', 'pending_review', 'pending', 'awaiting_payment'].includes(value)
            ? 'badge-amber'
            : 'badge-green')
      }
    >
      {labels[value] ?? value}
    </span>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={25} />
      Cargando tu workspace…
    </div>
  );
}
export function Empty({
  title,
  description,
  href,
  label,
}: {
  title: string;
  description: string;
  href?: string;
  label?: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Inbox size={28} />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {href ? (
        <Button asChild>
          <Link href={href}>
            {label ?? 'Descubrir talento'}
            <ArrowUpRight size={16} />
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
export function ErrorPanel({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="error-panel" role="alert">
      <h2>No hemos podido completar la acción</h2>
      <p>{message}</p>
      {retry ? (
        <Button variant="outline" onClick={retry}>
          Volver a intentar
        </Button>
      ) : null}
    </div>
  );
}
export function Title({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function AuthRequired() {
  return (
    <Empty
      title="Un espacio para tus derechos"
      description="Inicia sesión para guardar talento, crear campañas o gestionar tu likeness."
      href="/login"
      label="Iniciar sesión"
    />
  );
}
export function SandboxNote() {
  return (
    <div className="sandbox-note">
      <ShieldCheck size={17} />
      <span>
        Entorno de ensayo: pagos e identidad pueden ser de prueba. Las licencias emitidas aquí no
        sustituyen clearance legal ni contratos aprobados.
      </span>
    </div>
  );
}
