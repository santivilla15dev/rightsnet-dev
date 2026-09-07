'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Building2, Leaf } from 'lucide-react';
import {
  accountCapabilities,
  setPreferredSpace,
  takeWelcomeIntent,
} from '@/lib/auth-redirect';
import type { User } from '@/lib/types';
import { useSession } from './session';
import { Button } from './ui/button';
import { AuthRequired, Loading } from './common';

type Choice = 'brand' | 'creator';

export function Welcome() {
  const { user, loading } = useSession(),
    router = useRouter(),
    search = useSearchParams(),
    [choice, setChoice] = useState<Choice | null>(null);

  useEffect(() => {
    const fromQuery = search.get('intent');
    const fromStore = takeWelcomeIntent();
    const intent = fromQuery === 'creator' || fromQuery === 'buyer' ? fromQuery : fromStore;
    if (intent === 'creator') setChoice('creator');
    if (intent === 'buyer') setChoice('brand');
  }, [search]);

  useEffect(() => {
    if (loading || !user) return;
    const caps = accountCapabilities(user as User);
    if (caps.isAdmin) {
      router.replace('/ops');
      return;
    }
    if (!caps.needsWelcome) {
      if (caps.hasCreator && !caps.hasOrg) router.replace('/onboarding');
      else router.replace('/discover');
    }
  }, [loading, user, router]);

  function continueBrand() {
    setPreferredSpace('brand');
    router.push('/company/setup');
  }

  function continueCreator() {
    setPreferredSpace('creator');
    router.push('/onboarding');
  }

  if (loading) return <Loading />;
  if (!user) return <AuthRequired />;

  // Intent creador: welcome dedicado (sin picker dual)
  if (choice === 'creator') {
    return (
      <div className="login-page">
        <div className="login-wrap welcome-wrap">
          <p className="login-brand">
            RightsNet<span>.</span>
          </p>
          <h1>Bienvenido a RightsNet</h1>
          <p className="login-lead">
            Convierte tu likeness en derechos de IA controlados y licenciables.
          </p>
          <div className="login-form">
            <Button className="full-width" onClick={() => continueCreator()}>
              Empezar
              <ArrowRight size={16} />
            </Button>
          </div>
          <p className="login-demo-note">
            <button type="button" className="login-help-link" onClick={() => setChoice(null)}>
              También quiero un espacio marca
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-wrap welcome-wrap">
        <p className="login-brand">
          RightsNet<span>.</span>
        </p>
        <h1>¿Qué te gustaría hacer primero?</h1>
        <p className="login-lead">
          Elige un espacio para empezar. Más adelante puedes usar ambos con la misma cuenta.
        </p>

        <div className="signup-role-grid" role="group" aria-label="Primer espacio">
          <button
            type="button"
            className={'signup-role' + (choice === 'brand' ? ' signup-role-active' : '')}
            onClick={() => setChoice('brand')}
          >
            <Building2 size={22} />
            <strong>Licenciar creadores</strong>
            <span>Para marcas y agencias</span>
          </button>
          <button
            type="button"
            className="signup-role"
            onClick={() => setChoice('creator')}
          >
            <Leaf size={22} />
            <strong>Licenciar mi likeness</strong>
            <span>Para creadores</span>
          </button>
        </div>

        {choice === 'brand' ? (
          <div className="login-form">
            <Button className="full-width" onClick={() => continueBrand()}>
              Continuar
              <ArrowRight size={16} />
            </Button>
          </div>
        ) : null}

        <p className="login-demo-note">Puedes usar ambos más adelante.</p>
        <p className="login-demo-note">
          <Link href="/help" className="login-help-link">
            Guía
          </Link>
        </p>
      </div>
    </div>
  );
}
