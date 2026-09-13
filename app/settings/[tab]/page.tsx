import { notFound } from 'next/navigation';

import { SettingsTabPlaceholder } from '@/components/settings/settings-tab-placeholder';
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

  return <SettingsTabPlaceholder tab={tab} />;
}
