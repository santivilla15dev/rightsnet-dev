'use client';
import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  Compass,
  FileCheck2,
  Leaf,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react';
import { Button } from './ui/button';

const ILLUSTRATIVE_QUOTES = [
  {
    role: 'Marca',
    quote:
      'Consultar qué usos de imagen están permitidos antes de preparar el brief de una campaña.',
    label: 'Ejemplo de caso · comprador',
  },
  {
    role: 'Creador',
    quote: 'Definir territorios y canales y dejar registrados los usos aprobados en cada licencia.',
    label: 'Ejemplo de caso · talento',
  },
  {
    role: 'Agencia',
    quote:
      'Compartir con el cliente el alcance registrado y los resultados vinculados a su campaña.',
    label: 'Ejemplo de caso · agencia',
  },
] as const;

const HOME_FAQ = [
  {
    q: '¿Qué licencia obtengo?',
    a: 'Una licencia no exclusiva con territorios, canales y duración acordados, más un certificado firmado verificable en público.',
    href: '/help#licensing',
  },
  {
    q: '¿Quién paga?',
    a: 'La marca u organización compradora. El creador fija precios y reglas; el cobro live sigue desactivado hasta las condiciones de lanzamiento.',
    href: '/help#payments',
  },
  {
    q: '¿Cómo verifico una licencia?',
    a: 'Tras emitirla, el certificado incluye un enlace público. La guía explica el recorrido de verificación.',
    href: '/help#verification',
  },
  {
    q: '¿Hace falta cuenta para explorar?',
    a: 'No. Descubrir perfiles es público; la cuenta entra al configurar o comprar una licencia.',
    href: '/help#getting-started',
  },
] as const;

export function Home() {
  return (
    <div className="home-page">
      <section className="home-hero" aria-label="RightsNet">
        <div className="home-hero-plane" aria-hidden>
          <img
            className="home-hero-media"
            src="/home/hero-atmosphere.jpg"
            alt=""
            width={2400}
            height={1371}
            decoding="async"
            fetchPriority="high"
          />
        </div>
        <div className="home-wrap home-hero-inner">
          <p className="home-brand">
            RightsNet<span>.</span>
          </p>
          <h1>Licencia la imagen de personas reales para campañas con IA.</h1>
          <p className="home-lead">
            Organiza talento y derechos para tus campañas con IA: permisos registrados, límites
            acordados y certificado verificable.
          </p>
          <div className="home-cta">
            <Button asChild>
              <Link href="/discover">
                Encontrar creadores
                <ArrowRight size={16} />
              </Link>
            </Button>
            <Button variant="outline" className="home-cta-ghost" asChild>
              <Link href="/signup?intent=creator">Licenciar tu likeness</Link>
            </Button>
          </div>
          <p className="home-signin-note">
            ¿Ya tienes cuenta?{' '}
            <Link href="/login" className="home-text-link">
              Iniciar sesión
            </Link>
          </p>
          <p className="home-signin-note">
            <Link href="/help" className="home-text-link">
              Para agencias y marcas → Saber más
            </Link>
          </p>
        </div>
      </section>

      <section className="home-band home-band-light" aria-labelledby="home-how-title">
        <div className="home-wrap">
          <p className="home-kicker">El recorrido</p>
          <h2 id="home-how-title">Cómo funciona</h2>
          <p className="home-section-lead">
            Eliges talento, acuerdas el uso y obtienes una licencia que se puede comprobar en
            público.
          </p>
          <ol className="home-how-steps">
            <li>
              <span className="home-step-num" aria-hidden>
                01
              </span>
              <span className="home-how-icon" aria-hidden>
                <Compass size={22} />
              </span>
              <h3>Descubre</h3>
              <p>Explora creadores por categoría, territorio y tipo de campaña.</p>
            </li>
            <li>
              <span className="home-step-num" aria-hidden>
                02
              </span>
              <span className="home-how-icon" aria-hidden>
                <ShieldCheck size={22} />
              </span>
              <h3>Acuerda la licencia</h3>
              <p>Define canales, duración y uso. El motor comprueba si está permitido.</p>
            </li>
            <li>
              <span className="home-step-num" aria-hidden>
                03
              </span>
              <span className="home-how-icon" aria-hidden>
                <FileCheck2 size={22} />
              </span>
              <h3>Verifica el certificado</h3>
              <p>Tras el pago recibes un certificado firmado con enlace público de verificación.</p>
            </li>
          </ol>
          <Button asChild>
            <Link href="/discover">
              Empezar a descubrir
              <ArrowRight size={16} />
            </Link>
          </Button>
        </div>
      </section>

      <section className="home-band home-band-mist" aria-labelledby="home-audiences-title">
        <div className="home-wrap">
          <p className="home-kicker">Audiencias</p>
          <h2 id="home-audiences-title">Para quién es</h2>
          <p className="home-section-lead">Dos espacios en la misma plataforma.</p>
          <div className="home-audience-grid">
            <article className="home-panel">
              <span className="home-panel-icon" aria-hidden>
                <Building2 size={22} />
              </span>
              <h3>Marcas y agencias</h3>
              <p>
                Encuentra talento adulto, configura el uso publicitario sintético y compra una
                licencia por campaña, con territorios y canales explícitos.
              </p>
              <Link className="home-text-link" href="/discover">
                Ir al marketplace <ArrowRight size={15} />
              </Link>
            </article>
            <article className="home-panel">
              <span className="home-panel-icon" aria-hidden>
                <Leaf size={22} />
              </span>
              <h3>Creadores</h3>
              <p>
                Publica tu perfil, define qué usos permites o deniegas, fija precios y aprueba
                campañas cuando lo necesites.
              </p>
              <Link className="home-text-link" href="/signup?intent=creator">
                Licenciar mi likeness <ArrowRight size={15} />
              </Link>
            </article>
          </div>
        </div>
      </section>

      <section className="home-band home-band-light" aria-labelledby="home-includes-title">
        <div className="home-wrap">
          <p className="home-kicker">Alcance</p>
          <h2 id="home-includes-title">Qué incluye una licencia</h2>
          <p className="home-section-lead">
            El alcance queda escrito antes de pagar. Nada de permisos ambiguos.
          </p>
          <ul className="home-includes-grid">
            <li className="home-panel home-panel-quiet">
              <span className="home-panel-icon" aria-hidden>
                <ShieldCheck size={20} />
              </span>
              <strong>Uso acordado</strong>
              <span>Imagen o vídeo sintético para publicidad, según la política del creador.</span>
            </li>
            <li className="home-panel home-panel-quiet">
              <span className="home-panel-icon" aria-hidden>
                <LockKeyhole size={20} />
              </span>
              <strong>Límites claros</strong>
              <span>Territorios, canales, duración y licencia no exclusiva en el MVP.</span>
            </li>
            <li className="home-panel home-panel-quiet">
              <span className="home-panel-icon" aria-hidden>
                <FileCheck2 size={20} />
              </span>
              <strong>Certificado verificable</strong>
              <span>Firma criptográfica y página pública para comprobar el estado.</span>
            </li>
          </ul>
          <div className="home-includes-cta">
            <Button asChild>
              <Link href="/discover">
                Ver talento disponible
                <ArrowRight size={16} />
              </Link>
            </Button>
            <p className="home-territory-note">
              Piloto comercial propuesto en Austria y Alemania, pendiente de revisión jurídica y
              preparación operativa.{' '}
              <Link className="home-text-link" href="/help#verification">
                Cómo verificar una licencia
              </Link>
            </p>
          </div>
        </div>
      </section>

      <section className="home-band home-band-mist" aria-labelledby="home-quotes-title">
        <div className="home-wrap">
          <p className="home-kicker">Confianza</p>
          <h2 id="home-quotes-title">Qué buscan marcas y creadores</h2>
          <p className="home-section-lead">
            Escenarios de ejemplo para explicar el producto. No son testimonios de clientes.
          </p>
          <ul className="home-quotes-grid">
            {ILLUSTRATIVE_QUOTES.map((item) => (
              <li key={item.role} className="home-panel home-quote">
                <p className="home-quote-role">{item.role}</p>
                <p>{item.quote}</p>
                <p className="home-quote-label">{item.label}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="home-band home-band-light" aria-labelledby="home-faq-title">
        <div className="home-wrap">
          <p className="home-kicker">Preguntas</p>
          <h2 id="home-faq-title">FAQ rápido</h2>
          <p className="home-section-lead">
            Respuestas cortas. La guía completa está en{' '}
            <Link className="home-text-link" href="/help">
              /help
            </Link>
            .
          </p>
          <dl className="home-faq-list">
            {HOME_FAQ.map((item) => (
              <div key={item.q} className="home-faq-item">
                <dt>{item.q}</dt>
                <dd>
                  {item.a}{' '}
                  <Link className="home-text-link" href={item.href}>
                    Más en la guía <ArrowRight size={14} />
                  </Link>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="home-band home-band-deep" aria-labelledby="home-note-title">
        <div className="home-wrap home-note-row">
          <div>
            <p className="home-kicker home-kicker-light">Cómo empezar</p>
            <h2 id="home-note-title">Recorre el flujo completo</h2>
            <p>
              Crea cuenta, descubre talento y configura una licencia. Los cobros siguen en modo
              prueba hasta las condiciones de lanzamiento; la guía detalla cada paso.
            </p>
          </div>
          <Button variant="outline" className="home-cta-ghost" asChild>
            <Link href="/help">
              Leer la guía
              <ArrowRight size={16} />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="home-foot" aria-label="Pie">
        <div className="home-wrap home-foot-inner">
          <Link href="/blog">Blog</Link>
          <Link href="/help">Guía del producto</Link>
          <Link href="/discover">Encontrar creadores</Link>
          <Link href="/signup">Crear cuenta</Link>
          <Link href="/trust">Confianza y alcance</Link>
          <Link href="/legal/privacy">Privacidad</Link>
          <Link href="/legal/terms">Términos</Link>
          <span>Sin comercio live · plantillas contractuales provisionales</span>
        </div>
      </footer>
    </div>
  );
}
