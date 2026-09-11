'use client';
import Link from 'next/link';
import { Title } from './common';

type LegalPage = 'privacy' | 'terms';

const COPY: Record<
  LegalPage,
  { title: string; eyebrow: string; sections: { heading: string; body: string }[] }
> = {
  privacy: {
    eyebrow: 'LEGAL · PROVISIONAL',
    title: 'Privacidad',
    sections: [
      {
        heading: 'Estado del documento',
        body: 'Texto provisional de producto. No sustituye una política de privacidad aprobada por asesoría jurídica ni las condiciones de lanzamiento documentadas.',
      },
      {
        heading: 'Qué tratamos en el MVP',
        body: 'Datos de cuenta (correo, nombre mostrado), organización, perfiles de creador, intenciones de licencia y registros técnicos necesarios para operar el sandbox. El proveedor de identidad puede ser sandbox o Supabase según configuración.',
      },
      {
        heading: 'Comercio y pagos',
        body: 'Los cobros live permanecen desactivados por defecto. En modo prueba no se procesa dinero real de producción.',
      },
      {
        heading: 'Contacto',
        body: 'Para dudas operativas usa la guía del producto o el canal que indique el operador cuando exista entidad comercial.',
      },
    ],
  },
  terms: {
    eyebrow: 'LEGAL · PROVISIONAL',
    title: 'Términos de uso',
    sections: [
      {
        heading: 'Estado del documento',
        body: 'Plantilla provisional. Los contratos y consentimientos jurídicos definitivos siguen abiertos en las condiciones de lanzamiento; las plantillas DEMO del producto no son counsel.',
      },
      {
        heading: 'Uso del servicio',
        body: 'RightsNet ofrece un marketplace y motor de derechos para explorar, acordar y verificar licencias de likeness en publicidad con IA. Explorar perfiles puede hacerse sin cuenta; licenciar requiere autenticación.',
      },
      {
        heading: 'Licencias emitidas',
        body: 'El alcance de cada licencia (territorios, canales, duración, exclusividad) queda en el certificado y en los snapshots del sistema. No reescribimos historial incompatible.',
      },
      {
        heading: 'Limitaciones del MVP',
        body: 'Sin comercio live por defecto, sin afirmación de clearance legal AT–DE, y sin plataforma pública de desarrolladores más allá de Connect partner-gated.',
      },
    ],
  },
};

export function Legal({ page }: { page: LegalPage }) {
  const doc = COPY[page];
  return (
    <div className="legal-page">
      <Title eyebrow={doc.eyebrow} title={doc.title} description="Documento provisional de producto." />
      <p className="legal-nav">
        <Link href="/legal/privacy">Privacidad</Link>
        <span aria-hidden>·</span>
        <Link href="/legal/terms">Términos</Link>
        <span aria-hidden>·</span>
        <Link href="/help">Guía</Link>
      </p>
      {doc.sections.map((section) => (
        <section key={section.heading} className="panel help-panel">
          <h2>{section.heading}</h2>
          <p>{section.body}</p>
        </section>
      ))}
    </div>
  );
}
