import { notFound } from 'next/navigation';

import { SettingsTabContent } from '@/components/settings/settings-tab-content';
import { isSettingsTab } from '@/lib/settings-tabs';

export const dynamic = 'force-dynamic';

export default async function SettingsTabPage({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;

  if (!isSettingsTab(tab)) notFound();

  return <SettingsTabContent tab={tab} />;
}
