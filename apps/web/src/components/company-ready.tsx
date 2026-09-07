'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { accountCapabilities, setPreferredSpace } from '@/lib/auth-redirect';
import type { User } from '@/lib/types';
import { useSession } from './session';
import { Button } from './ui/button';
import { AuthRequired, Loading } from './common';

export function CompanyReady() {
  const { user, loading } = useSession(),
    router = useRouter();

  useEffect(() => {
    setPreferredSpace('brand');
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    const caps = accountCapabilities(user as User);
    if (caps.isAdmin) {
      router.replace('/ops');
      return;
    }
    if (!caps.hasOrg) {
      router.replace('/company/setup');
    }
  }, [loading, user, router]);

  if (loading) return <Loading />;
  if (!user) return <AuthRequired />;

  const org = user.organizations?.[0];
  const name = org?.legal_name ?? 'Tu empresa';

  return (
    <div className="login-page">
      <div className="login-wrap welcome-wrap">
        <p className="login-brand">
          RightsNet<span>.</span>
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <CheckCircle2 size={40} aria-hidden />
        </div>
        <h1>Tu empresa está lista</h1>
        <p className="login-lead">
          <strong>{name}</strong> puede licenciar creadores. Encuentra talento y configura el
          uso con Rights Check.
        </p>
        <Button className="full-width" onClick={() => router.push('/discover')}>
          Encontrar creadores
          <ArrowRight size={16} />
        </Button>
        <p className="login-demo-note">
          <Link href="/company" className="login-help-link">
            Ir a campañas
          </Link>
        </p>
      </div>
    </div>
  );
}
