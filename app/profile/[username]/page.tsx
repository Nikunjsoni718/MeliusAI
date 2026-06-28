import { ProfileDashboard } from '@/components/dashboard/profile-dashboard';

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;

  return <ProfileDashboard profileUsername={decodeURIComponent(username)} />;
}
