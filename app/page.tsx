import { SessionRouteGuard } from '@/components/auth/session-route-guard';
import { LandingPage } from '@/components/marketing/landing-page';

export default function Page() {
  return (
    <SessionRouteGuard>
      <LandingPage />
    </SessionRouteGuard>
  );
}
