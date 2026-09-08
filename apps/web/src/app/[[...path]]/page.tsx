import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { Home } from '@/components/home';
import { Discover } from '@/components/discover';
import { CreatorDetail } from '@/components/creator-detail';
import { Company, OrderDetail } from '@/components/company';
import { CreatorDashboard } from '@/components/creator-dashboard';
import { Admin } from '@/components/admin';
import {
  RightsOperationsOverview,
  RightsOperationsCampaign,
} from '@/components/rights-operations';
import { ExistingDealOcrIngest } from '@/components/existing-deal-ocr';
import { Verify } from '@/components/verify';
import { GenerationVerify } from '@/components/generation-verify';
import { Login } from '@/components/login';
import { Signup } from '@/components/signup';
import { AccountSecurity } from '@/components/account-security';
import { Welcome } from '@/components/welcome';
import { CompanySetup } from '@/components/company-setup';
import { CompanyReady } from '@/components/company-ready';
import { AuthCallback } from '@/components/auth-callback';
import { ForgotPassword } from '@/components/forgot-password';
import { ResetPassword } from '@/components/reset-password';
import { Help } from '@/components/help';
import { Demo } from '@/components/demo';
import { Onboarding } from '@/components/onboarding';
import { Application } from '@/components/application';
import { Loading } from '@/components/common';

export default async function Page({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  const route = path.join('/');
  if (!route) return <Home />;
  if (route === 'discover') return <Discover />;
  if (route === 'saved') return <Discover savedOnly />;
  if (route === 'login') return <Login />;
  if (route === 'account/security') return <AccountSecurity />;
  if (route === 'signup')
    return (
      <Suspense fallback={<Loading />}>
        <Signup />
      </Suspense>
    );
  if (route === 'welcome')
    return (
      <Suspense fallback={<Loading />}>
        <Welcome />
      </Suspense>
    );
  if (route === 'auth/callback') return <AuthCallback />;
  if (route === 'forgot-password') return <ForgotPassword />;
  if (route === 'reset-password') return <ResetPassword />;
  if (route === 'demo')
    return (
      <Suspense fallback={<Loading />}>
        <Demo />
      </Suspense>
    );
  if (route === 'onboarding')
    return (
      <Suspense fallback={<Loading />}>
        <Onboarding />
      </Suspense>
    );
  if (route === 'application') return <Application />;
  if (route === 'company/setup') return <CompanySetup />;
  if (route === 'company/ready') return <CompanyReady />;
  if (route === 'company') return <Company />;
  if (route === 'company/licenses') return <Company licensesOnly />;
  if (route === 'dashboard') return <CreatorDashboard />;
  if (route === 'admin') redirect('/ops');
  if (route === 'ops') return <Admin />;
  if (route === 'ops/rights')
    return (
      <Suspense fallback={<Loading />}>
        <RightsOperationsOverview />
      </Suspense>
    );
  if (route === 'ops/rights/campaign')
    return (
      <Suspense fallback={<Loading />}>
        <RightsOperationsCampaign />
      </Suspense>
    );
  if (route === 'ops/rights/ingest')
    return (
      <Suspense fallback={<Loading />}>
        <ExistingDealOcrIngest />
      </Suspense>
    );
  if (route === 'help') return <Help />;
  if (path.length === 2 && path[0] === 'creators') return <CreatorDetail id={path[1]} />;
  if (path.length === 2 && path[0] === 'verify') {
    if (path[1].startsWith('RN-GEN-')) return <GenerationVerify token={path[1]} />;
    return <Verify token={path[1]} />;
  }
  if (path.length === 3 && path[0] === 'verify' && path[1] === 'generation')
    return <GenerationVerify token={path[2]} />;
  if (path.length === 3 && path[0] === 'company' && ['orders', 'checkout'].includes(path[1]))
    return <OrderDetail id={path[2]} paymentPage={path[1] === 'checkout'} />;
  notFound();
}
