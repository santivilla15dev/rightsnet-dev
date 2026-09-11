import Link from 'next/link';
import { Title } from './common';

const CHECKS = [
  {
    title: 'Compatibilidad del uso',
    body: 'Comparamos territorio, canales, duración y uso solicitado con las reglas registradas. Si faltan datos, la evaluación queda incompleta. Una compatibilidad favorable no concede una licencia.',
  },
  {
    title: 'Derechos y aprobaciones',
    body: 'El alcance depende de la licencia o del acuerdo confirmado. Cuando se necesita aprobación, debe quedar registrada; una solicitud o el paso del tiempo no amplían los permisos.',
  },
  {
    title: 'Autorización de generación',
    body: 'Las integraciones habilitadas pueden solicitar una autorización específica sobre derechos vigentes. El contenido se genera con un proveedor externo.',
  },
  {
    title: 'Registro del resultado',
    body: 'Vinculamos el output registrado con su autorización y sus evidencias. Preflight y Postflight comprueban los datos vinculados; no inspeccionan por sí solos todo el contenido de una imagen o vídeo.',
  },
] as const;

export function Trust() {
  return (
    <div className="legal-page">
      <Title
        eyebrow="CONFIANZA Y ALCANCE"
        title="Qué verifica RightsNet"
        description="Permisos para usar la imagen de personas reales en publicidad con IA, con un alcance que puedas consultar."
      />
      <section className="panel help-panel" aria-labelledby="trust-stage">
        <h2 id="trust-stage">Estado del servicio</h2>
        <p>
          La versión actual está en pruebas, con plantillas contractuales provisionales. El piloto
          comercial propuesto en Austria y Alemania está pendiente de revisión jurídica y
          preparación operativa. Esta página no anuncia su apertura comercial.
        </p>
      </section>
      {CHECKS.map((check) => (
        <section key={check.title} className="panel help-panel">
          <h2>{check.title}</h2>
          <p>{check.body}</p>
        </section>
      ))}
      <section className="panel help-panel">
        <h2>Qué significa un certificado verificable</h2>
        <p>
          Permite consultar el estado y el alcance registrado. Un Campaign Passport comparte un
          resumen de campaña sujeto a caducidad y revocación. La verificación técnica no garantiza
          que cualquier uso del contenido sea legal ni sustituye la revisión del anuncio. La
          ausencia de un registro en RightsNet no demuestra que un contenido carezca de permiso.
        </p>
      </section>
      <section className="panel help-panel">
        <h2>Antes de publicar un anuncio</h2>
        <p>
          Revisa que el output final respete el alcance acordado y que las aprobaciones necesarias
          estén completas. Comprueba también los derechos de otros materiales, las afirmaciones
          publicitarias y los requisitos de identificación del contenido generado con IA aplicables
          a la campaña y al canal. La licencia de imagen no resuelve automáticamente esas
          cuestiones.
        </p>
      </section>
      <section className="panel help-panel">
        <h2>Privacidad e información del operador</h2>
        <p>
          Los textos de privacidad y términos siguen siendo provisionales. La identificación del
          operador, el contacto para ejercer derechos y las condiciones definitivas deberán estar
          publicados antes de abrir el servicio a usuarios reales.
        </p>
        <p className="legal-nav">
          <Link href="/legal/privacy">Privacidad</Link>
          <Link href="/legal/terms">Términos de uso</Link>
          <Link href="/help">Guía del producto</Link>
        </p>
      </section>
      <p>
        <Link href="/discover">Explorar talento</Link>
      </p>
    </div>
  );
}
