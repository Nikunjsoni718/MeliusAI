export const settingsTabs = [
  {
    slug: 'account',
    label: 'Account & Security',
    description: 'Manage your account identity and sign-in protections.',
  },
  {
    slug: 'public-profile',
    label: 'Public Profile Preferences',
    description: 'Control what visitors can see on your public developer profile.',
  },
  {
    slug: 'vault',
    label: 'Vault Defaults',
    description: 'Choose the default privacy and workflow behavior for new Vault assets.',
  },
  {
    slug: 'integrations',
    label: 'Integrations',
    description: 'Connect the developer tools that power your workspace.',
  },
  {
    slug: 'notifications',
    label: 'Notifications',
    description: 'Decide which workspace activity should reach you.',
  },
  {
    slug: 'billing',
    label: 'Billing & Plans',
    description: 'Review your plan and upcoming workspace capabilities.',
  },
] as const;

export type SettingsTab = (typeof settingsTabs)[number]['slug'];

export function isSettingsTab(value: string): value is SettingsTab {
  return settingsTabs.some((tab) => tab.slug === value);
}

export function getSettingsTab(tab: SettingsTab) {
  return settingsTabs.find((item) => item.slug === tab)!;
}
