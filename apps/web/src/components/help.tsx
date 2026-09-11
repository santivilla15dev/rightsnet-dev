'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Search, ShieldCheck, FileCheck2, ArrowRight, Building2, Leaf } from 'lucide-react';
import { Title, SandboxNote } from './common';
import { Button } from './ui/button';
import { api } from '@/lib/api';
import { useSession } from './session';

export function Help() {
  const { user, toast } = useSession(),
    [details, setDetails] = useState(''),
    [busy, setBusy] = useState(false);

  return (
    <>
      <Title
        eyebrow="GUÍA DEL PRODUCTO"
        title="Cómo funciona RightsNet"
        description="Documentación orientativa. Crea una cuenta o inicia sesión para usar el producto."
      />

      <nav className="help-toc panel" aria-label="Índice">
        <a href="#getting-started">Primeros pasos</a>
        <a href="#for-creators">Para creadores</a>
        <a href="#for-brands">Para marcas</a>
        <a href="#licensing">Licencias</a>
        <a href="#verification">Verificación</a>
        <a href="#policies">Políticas de derechos</a>
        <a href="#payments">Pagos</a>
        <a href="#faq">FAQ</a>
      </nav>

      <div className="help-grid">
        {[
          {
            icon: Search,
            title: '01. Encuentra tu talento',
            text: 'Explora perfiles ilustrados, filtra por categoría y elige un creador compatible con tu campaña.',
          },
          {
            icon: ShieldCheck,
            title: '02. Acuerda el uso',
            text: 'Configura territorios, canales y duración. El motor comprueba las reglas y solicita aprobación cuando corresponde.',
          },
          {
            icon: FileCheck2,
            title: '03. Obtén tu licencia',
            text: 'Revisa el resumen de licencia, acepta los términos (el contrato completo está detrás de Ver términos) y continúa al pago. Recibirás un certificado con firma verificable.',
          },
        ].map((x) => (
          <article className="panel" key={x.title}>
            <x.icon size={28} />
            <h2>{x.title}</h2>
            <p>{x.text}</p>
          </article>
        ))}
      </div>

      <section id="getting-started" className="panel help-panel">
        <h2>Primeros pasos</h2>
        <p>
          <strong>Explorar</strong> no requiere cuenta: ve a{' '}
          <Link href="/discover">Descubrir</Link>.
        </p>
        <p>
          <strong>Crear cuenta</strong>: registro en{' '}
          <Link href="/signup">/signup</Link> (sin elegir rol). Luego{' '}
          <Link href="/welcome">/welcome</Link> elige el primer espacio. Marca: crear empresa en{' '}
          <Link href="/company/setup">/company/setup</Link>; creador: onboarding. Requiere{' '}
          <code>AUTH_PROVIDER=supabase</code>.
        </p>
        <p>
          <strong>Iniciar sesión</strong> con correo y contraseña en{' '}
          <Link href="/login">/login</Link>.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Button asChild>
            <Link href="/signup">
              Crear cuenta
              <ArrowRight size={16} />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/login">Iniciar sesión</Link>
          </Button>
        </div>
      </section>

      <section id="for-creators" className="panel help-panel">
        <h2>
          <Leaf size={18} style={{ display: 'inline', marginRight: 8 }} />
          Para creadores
        </h2>
        <p>
          Regístrate como creador, luego completa el alta en <Link href="/onboarding">/onboarding</Link>{' '}
          (perfil → identidad → likeness → reglas → precio → consentimiento → revisión). Tras
          enviar, el estado vive en <Link href="/application">/application</Link>. El dashboard es
          para perfiles ya aprobados.
        </p>
      </section>

      <section id="for-brands" className="panel help-panel">
        <h2>
          <Building2 size={18} style={{ display: 'inline', marginRight: 8 }} />
          Para marcas
        </h2>
        <p>
          Al registrarte como marca se crea una organización mínima (tú eres owner). Explora en
          Descubrir, configura el uso en la ficha del creador y sigue el Rights Check.
        </p>
      </section>

      <section id="licensing" className="panel help-panel">
        <h2>Licencias</h2>
        <p>
          Discover → ficha → configurar uso → Rights Check. Tres caminos:
        </p>
        <ul>
          <li>
            <strong>ALLOW</strong> → Continuar → resumen de licencia → pago.
          </li>
          <li>
            <strong>REQUIRES_APPROVAL</strong> → el creador aprueba → en Mis campañas pulsa Continuar
            → resumen de licencia → pago.
          </li>
          <li>
            <strong>DENY</strong> → stop (no se puede forzar el checkout).
          </li>
        </ul>
      </section>

      <section id="verification" className="panel help-panel">
        <h2>Verificación</h2>
        <p>
          Identidad del creador (simulación local o Stripe Identity de prueba). Evidencia visual y
          consentimiento versionado antes de la revisión Ops.
        </p>
      </section>

      <section id="policies" className="panel help-panel">
        <h2>Políticas de derechos</h2>
        <p>
          Estados explícitos ALLOW, DENY, REQUIRES_APPROVAL, NOT_SPECIFIED. El motor decide si una
          campaña es licenciable.
        </p>
      </section>

      <section id="payments" className="panel help-panel">
        <h2>Pagos</h2>
        <p>
          Con pagos en modo prueba el cobro no es live. El comercio live permanece desactivado hasta
          las condiciones de lanzamiento documentadas.
        </p>
      </section>

      <section id="faq" className="panel help-panel">
        <h2>FAQ</h2>
        <p>
          <strong>¿Qué es una licencia en RightsNet?</strong> Un permiso estructurado (territorios,
          canales, duración) con certificado firmado verificable. No es un contrato legal final
          hasta que counsel apruebe las plantillas de lanzamiento.
        </p>
        <p>
          <strong>¿Quién paga?</strong> La organización compradora. El creador define precios y
          reglas. El comercio live permanece desactivado por defecto.
        </p>
        <p>
          <strong>¿Cómo verifico una licencia?</strong> El certificado incluye un enlace público
          bajo <code>/verify/…</code>. Ver también la sección Verificación arriba.
        </p>
        <p>
          <strong>¿Dónde está Ops?</strong> Solo para usuarios con rol admin (cuenta provisionada
          con ese rol). No hay entrada de producto desde la guía.
        </p>
        <p>
          <strong>¿Signup vs login?</strong> Signup elige marca o creador y crea la cuenta. Login
          entra con correo ya confirmado.
        </p>
      </section>

      {user ? (
        <section className="panel help-panel">
          <h2>Comunicar una incidencia</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const r = await api<{ id: string }>('incidents', {
                  method: 'POST',
                  body: { category: 'other', details },
                });
                toast('Incidencia registrada: ' + r.id.slice(0, 8));
                setDetails('');
              } catch (e) {
                toast((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Describe qué ha ocurrido
              <textarea
                required
                minLength={10}
                maxLength={2000}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
              />
            </label>
            <Button disabled={busy}>{busy ? 'Registrando…' : 'Registrar incidencia'}</Button>
          </form>
        </section>
      ) : null}
      <SandboxNote />
    </>
  );
}
