import { SessionRouteGuard } from '@/components/auth/session-route-guard';
import { LandingPage } from '@/components/marketing/landing-page';
import { SiteFooter } from '@/components/layout/site-footer';

export default function Page() {
  return (
    <SessionRouteGuard>
      <LandingPage />
      <SiteFooter />
    </SessionRouteGuard>
  );
}
