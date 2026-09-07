'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Compass,
  Bookmark,
  FileCheck2,
  LayoutDashboard,
  ShieldCheck,
  ArrowUpRight,
  ChevronDown,
  Menu,
  X,
  Leaf,
  LifeBuoy,
  Building2,
  ImageIcon,
  ScrollText,
  Inbox,
  Wallet,
} from 'lucide-react';
import { useSession } from './session';
import { api } from '@/lib/api';
import { clearDemoSession, getDemoSession, type DemoSession } from '@/lib/demo-session';
import {
  accountCapabilities,
  getPreferredSpace,
  setPreferredSpace,
  type AccountSpace,
} from '@/lib/auth-redirect';

function DemoBanner({
  demo,
  onExit,
}: {
  demo: DemoSession;
  onExit: () => void;
}) {
  return (
    <div className="demo-banner" role="status">
      <div>
        <strong>MODO DEMO</strong>
        <span>
          Estás viendo RightsNet como: {demo.personaName}
          {demo.orgName ? ` · ${demo.orgName}` : ''}
        </span>
      </div>
      <button type="button" onClick={onExit}>
        Salir de la demo
      </button>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname(),
    { user, refresh } = useSession(),
    router = useRouter(),
    [open, setOpen] = useState(false),
    [demo, setDemo] = useState<DemoSession | null>(null),
    [space, setSpace] = useState<AccountSpace | null>(null);

  useEffect(() => {
    setDemo(getDemoSession());
    setSpace(getPreferredSpace());
  }, [path, user]);

  const bare =
    path === '/' ||
    path === '/login' ||
    path === '/signup' ||
    path === '/welcome' ||
    path === '/company/setup' ||
    path === '/company/ready' ||
    path === '/auth/callback' ||
    path === '/forgot-password' ||
    path === '/reset-password' ||
    path === '/demo' ||
    path === '/onboarding' ||
    path === '/application';

  const caps = user ? accountCapabilities(user) : null;
  const hasCreator = !!(caps?.hasCreator || user?.role === 'creator');
  const hasOrg = !!caps?.hasOrg || (user?.role === 'buyer' && !!user?.organizations?.length);
  const isAdmin = user?.role === 'admin';
  const org = user?.organizations?.[0];

  const activeSpace: AccountSpace =
    space ??
    (path.startsWith('/dashboard') || path === '/onboarding' || path === '/application'
      ? 'creator'
      : 'brand');

  const isCreator =
    !isAdmin &&
    (activeSpace === 'creator'
      ? hasCreator || path === '/onboarding' || path === '/application'
      : false);
  const isBuyer = !isAdmin && !isCreator && (hasOrg || user?.role === 'buyer' || !user);

  function switchSpace(next: AccountSpace) {
    setPreferredSpace(next);
    setSpace(next);
    setOpen(false);
    router.push(next === 'creator' ? (hasCreator ? '/dashboard' : '/onboarding') : '/discover');
  }

  async function exitDemo() {
    clearDemoSession();
    setDemo(null);
    try {
      await api('auth/logout', { method: 'POST', body: {} });
      await refresh();
    } catch {
      /* ignore */
    }
    router.push('/');
  }

  const buyerLinks = [
    { href: '/discover', label: 'Descubrir', icon: Compass },
    { href: '/saved', label: 'Guardados', icon: Bookmark },
    { href: '/company', label: 'Campañas', icon: LayoutDashboard },
    { href: '/company/licenses', label: 'Licencias', icon: FileCheck2 },
  ];

  const creatorLinks = [
    { href: '/dashboard', label: 'Resumen', icon: LayoutDashboard },
    { href: '/dashboard#likeness', label: 'Mi likeness', icon: ImageIcon },
    { href: '/dashboard#rules', label: 'Reglas de licencia', icon: ScrollText },
    { href: '/dashboard#requests', label: 'Solicitudes', icon: Inbox },
    { href: '/company/licenses', label: 'Licencias', icon: FileCheck2 },
    { href: '/dashboard#earnings', label: 'Ingresos', icon: Wallet },
  ];

  const publicLinks = [
    { href: '/discover', label: 'Descubrir', icon: Compass },
    { href: '/help', label: 'Guía', icon: LifeBuoy },
  ];

  const links = isAdmin
    ? [{ href: '/ops', label: 'Ops', icon: ShieldCheck }, ...publicLinks]
    : isCreator
      ? creatorLinks
      : isBuyer
        ? buyerLinks
        : publicLinks;

  if (bare) {
    const isAuthSurface =
      path === '/login' ||
      path === '/signup' ||
      path === '/welcome' ||
      path === '/company/setup' ||
      path === '/company/ready' ||
      path === '/auth/callback' ||
      path === '/forgot-password' ||
      path === '/reset-password' ||
      path === '/demo' ||
      path === '/onboarding' ||
      path === '/application';
    return (
      <div className={'home-shell' + (isAuthSurface ? ' login-shell' : '')}>
        {demo ? <DemoBanner demo={demo} onExit={() => void exitDemo()} /> : null}
        <header className="home-topbar">
          <Link href="/" className="wordmark">
            <span className="brand-icon">
              r<span />
            </span>
            RightsNet<span className="brand-dot">.</span>
          </Link>
          <div className="home-topbar-actions">
            <span className="sandbox-pill">
              <span />
              Entorno de prueba
            </span>
            {path === '/login' ||
            path === '/signup' ||
            path === '/welcome' ||
            path === '/company/setup' ||
            path === '/company/ready' ||
            path === '/auth/callback' ||
            path === '/forgot-password' ||
            path === '/reset-password' ||
            path === '/demo' ? (
              <Link className="profile-switch" href="/">
                Inicio
              </Link>
            ) : (
              <Link className="profile-switch" href="/login">
                <span className="avatar-small">{user?.display_name?.slice(0, 1) ?? 'G'}</span>
                <span>{user?.display_name?.split(' · ')[0] ?? 'Entrar'}</span>
              </Link>
            )}
          </div>
        </header>
        <main id="main" className="home-main">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className={'sidebar ' + (open ? 'sidebar-open' : '')}>
        <Link href="/" className="wordmark">
          <span className="brand-icon">
            r<span />
          </span>
          RightsNet<span className="brand-dot">.</span>
        </Link>
        <button className="mobile-close" aria-label="Cerrar menú" onClick={() => setOpen(false)}>
          <X size={22} />
        </button>
        <div className="workspace-switch">
          <span className="workspace-icon">
            {isCreator ? <Leaf size={18} /> : <Building2 size={18} />}
          </span>
          <div>
            <b>
              {isCreator
                ? user?.display_name?.split(' · ')[0] ?? 'Creador'
                : org?.legal_name?.split(' · ')[0] ?? 'Explorar'}
            </b>
            <small>
              {isCreator
                ? 'Espacio creador'
                : org
                  ? `${user?.display_name?.split(' · ')[0] ?? 'Usuario'} · ${org.role}`
                  : 'Sin organización'}
            </small>
          </div>
          <ChevronDown size={15} />
        </div>
        {hasCreator && hasOrg ? (
          <div className="space-switcher" role="group" aria-label="Cambiar espacio">
            <button
              type="button"
              className={activeSpace === 'brand' ? 'active' : ''}
              onClick={() => switchSpace('brand')}
              title="Buyer Workspace"
            >
              {org?.legal_name ?? 'Espacio marca'}
            </button>
            <button
              type="button"
              className={activeSpace === 'creator' ? 'active' : ''}
              onClick={() => switchSpace('creator')}
              title="Creator Workspace"
            >
              {user?.display_name?.split(' · ')[0] ?? 'Espacio creador'}
            </button>
          </div>
        ) : null}
        {hasCreator && !hasOrg && !isAdmin ? (
          <div className="space-switcher">
            <Link
              href="/company/setup"
              className="nav-item"
              style={{ fontSize: 13 }}
              onClick={() => setOpen(false)}
            >
              + Crear organización
            </Link>
          </div>
        ) : null}
        <div className="nav-label">{isCreator ? 'CREADOR' : isBuyer ? 'MARCA' : 'WORKSPACE'}</div>
        <nav>
          {links.map((l) => (
            <Link
              onClick={() => setOpen(false)}
              key={l.href}
              className={
                'nav-item ' +
                (path === l.href ||
                (l.href === '/discover' && path.startsWith('/creators/')) ||
                (l.href.startsWith('/dashboard') && path === '/dashboard')
                  ? 'active'
                  : '')
              }
              href={l.href}
            >
              <l.icon size={19} />
              {l.label}
              {l.href === '/discover' ? <span className="nav-dot" /> : null}
            </Link>
          ))}
        </nav>
        {!hasCreator && !isAdmin ? (
          <>
            <div className="nav-label second">CREAR</div>
            <nav>
              <Link href="/onboarding" className="nav-item" onClick={() => setOpen(false)}>
                <Leaf size={19} />
                Licenciar mi likeness
              </Link>
            </nav>
          </>
        ) : null}
        {hasCreator && !hasOrg && !isAdmin ? (
          <>
            <div className="nav-label second">MARCA</div>
            <nav>
              <Link href="/welcome?intent=buyer" className="nav-item" onClick={() => setOpen(false)}>
                <Building2 size={19} />
                Crear espacio marca
              </Link>
            </nav>
          </>
        ) : null}
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <div className="mini-logo">
              <ShieldCheck size={20} />
            </div>
            <b>Tu identidad. Tus reglas.</b>
            <p>Decide cómo participa tu imagen en el futuro de la IA.</p>
            <Link href={hasCreator ? '/dashboard' : '/onboarding'}>
              {hasCreator ? 'Gestionar derechos' : 'Licenciar mi likeness'}{' '}
              <ArrowUpRight size={16} />
            </Link>
          </div>
          <Link href="/help" className="help-link">
            <LifeBuoy size={17} />
            Cómo funciona
            <ArrowUpRight size={15} />
          </Link>
          <div className="sidebar-footer">
            <span className="status-dot" /> Sandbox local <span>v0.1</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        {demo ? <DemoBanner demo={demo} onExit={() => void exitDemo()} /> : null}
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu" aria-label="Abrir menú" onClick={() => setOpen(true)}>
              <Menu size={22} />
            </button>
            <span className="breadcrumb">
              {isCreator ? 'Creador' : isBuyer ? org?.legal_name?.split(' · ')[0] ?? 'Marca' : 'Workspace'}{' '}
              <span>/</span>{' '}
              <b>
                {path.startsWith('/ops') || path.startsWith('/admin')
                  ? 'Ops'
                  : path.startsWith('/dashboard')
                    ? 'Resumen'
                    : path.includes('licenses')
                      ? 'Licencias'
                      : path.startsWith('/company')
                        ? 'Campañas'
                        : path.startsWith('/help')
                          ? 'Guía'
                          : 'Descubrir'}
              </b>
            </span>
          </div>
          <div className="topbar-actions">
            {isBuyer && org ? (
              <span className="org-chip" title="Licenciatario">
                Licenciatario: {org.legal_name}
              </span>
            ) : null}
            <span className="sandbox-pill">
              <span />
              Entorno de prueba
            </span>
            <Link className="profile-switch" href="/login">
              <span className="avatar-small">{user?.display_name?.slice(0, 1) ?? 'G'}</span>
              <span>{user?.display_name?.split(' · ')[0] ?? 'Entrar'}</span>
              <ChevronDown size={14} />
            </Link>
          </div>
        </header>
        <main id="main" className="main-content">
          {children}
        </main>
        <footer className="main-footer">
          <span>© 2026 RightsNet · Derechos claros. Posibilidades nuevas.</span>
          <Link href="/help">
            Guía <ArrowUpRight size={13} />
          </Link>
        </footer>
      </div>
    </div>
  );
}
