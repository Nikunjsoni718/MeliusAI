import type { ReactNode } from 'react';

import { SettingsHubLayout } from '@/components/settings/settings-hub-layout';

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <SettingsHubLayout>{children}</SettingsHubLayout>;
}
