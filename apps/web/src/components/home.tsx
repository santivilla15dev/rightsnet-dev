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
          <h1>Licencia talento IA con derechos claros.</h1>
          <p className="home-lead">
            Marketplace para licenciar likeness en campañas con IA: permiso claro, límites
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
        </div>
      </section>

      <section className="home-band home-band-deep" aria-labelledby="home-note-title">
        <div className="home-wrap home-note-row">
          <div>
            <p className="home-kicker home-kicker-light">Entorno</p>
            <h2 id="home-note-title">Prueba el flujo completo</h2>
            <p>
              Este entorno es de prueba: puedes recorrer el marketplace de punta a punta sin
              comercio live. La guía explica cada paso con detalle.
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
          <Link href="/help">Guía del producto</Link>
          <Link href="/discover">Encontrar creadores</Link>
          <Link href="/signup">Crear cuenta</Link>
          <span>Sin comercio live · plantillas contractuales provisionales</span>
        </div>
      </footer>
    </div>
  );
}
