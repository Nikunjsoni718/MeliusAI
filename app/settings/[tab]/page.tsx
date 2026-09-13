import { notFound } from 'next/navigation';

import { SettingsTabContent } from '@/components/settings/settings-tab-content';
import { isSettingsTab, settingsTabs } from '@/lib/settings-tabs';

export const dynamicParams = false;

export function generateStaticParams() {
  return settingsTabs.map(({ slug }) => ({ tab: slug }));
}

export default async function SettingsTabPage({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;

  if (!isSettingsTab(tab)) {
    notFound();
  }

  return <SettingsTabContent tab={tab} />;
}
