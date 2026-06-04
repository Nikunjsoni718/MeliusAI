import { ProfileDashboard } from '@/components/dashboard/profile-dashboard';

export default function ProfilePage({ params }: { params: { username: string } }) {
  return <ProfileDashboard profileUsername={params.username} />;
}
