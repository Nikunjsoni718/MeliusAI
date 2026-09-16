'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';

import { clearPersistedAuthState } from '@/lib/auth-session-routing';
import {
  CURRENT_STATUS_OPTIONS,
  type PersistedSettings,
} from '@/lib/settings';
import { getSettingsTab, type SettingsTab } from '@/lib/settings-tabs';
import { disableWebPush, enableWebPush, getWebPushStatus } from '@/lib/web-push';
import { workspaceCacheKeys } from '@/lib/workspace-cache';

import { useSettingsViewer } from './settings-hub-layout';

const inputClassName =
  'w-full rounded-md border border-blue-950/50 bg-[#050b1b]/60 px-3 py-2.5 text-sm text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 disabled:cursor-not-allowed disabled:opacity-60';
const primaryButtonClassName =
  'rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-100 transition-colors hover:border-cyan-300/60 hover:bg-cyan-500/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButtonClassName =
  'rounded-lg border border-blue-950/60 bg-[#071329]/60 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:border-cyan-500/30 hover:bg-[#0b1d38]/80 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 disabled:cursor-not-allowed disabled:opacity-50';
const destructiveButtonClassName =
  'rounded-md border border-red-900/70 bg-red-950/40 px-3.5 py-2 text-sm font-medium text-red-200 transition-colors hover:bg-red-950/70 disabled:cursor-not-allowed disabled:opacity-50';

type SettingsSave = (update: Partial<PersistedSettings>) => Promise<PersistedSettings>;

function GitHubMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M12 .7a11.3 11.3 0 0 0-3.6 22c.6.1.8-.3.8-.6v-2.1c-3.3.7-4-1.4-4-1.4-.6-1.4-1.3-1.8-1.3-1.8-1-.7.1-.7.1-.7 1.1.1 1.7 1.2 1.7 1.2 1 1.7 2.7 1.2 3.3.9.1-.7.4-1.2.7-1.5-2.7-.3-5.5-1.4-5.5-6a4.8 4.8 0 0 1 1.3-3.4c-.1-.3-.6-1.6.1-3.4 0 0 1.1-.4 3.6 1.3a12.2 12.2 0 0 1 6.5 0c2.5-1.7 3.6-1.3 3.6-1.3.7 1.8.2 3.1.1 3.4a4.8 4.8 0 0 1 1.3 3.4c0 4.6-2.8 5.7-5.5 6 .4.3.8 1 .8 2v3c0 .3.2.7.8.6A11.3 11.3 0 0 0 12 .7Z" />
    </svg>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function Section({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`border-t border-blue-950/50 py-7 first:border-t-0 first:pt-0 ${className}`}>{children}</section>;
}

function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block text-sm font-medium text-slate-200">
      {children}
    </label>
  );
}

function FormNotice({ error, success }: { error?: string | null; success?: string | null }) {
  if (!error && !success) return null;

  return (
    <p className={`mt-3 text-sm ${error ? 'text-red-300' : 'text-emerald-300'}`} role={error ? 'alert' : 'status'}>
      {error ?? success}
    </p>
  );
}

function SettingsToggle({
  checked,
  description,
  label,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  description: string;
  label: string;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const isChecked = Boolean(checked);

  return (
    <div className="flex items-start justify-between gap-5 rounded-md border border-blue-950/50 bg-[#050b1b]/60 p-4">
      <div>
        <p className="text-sm font-medium text-slate-200">{label}</p>
        <p className="mt-1 text-sm leading-6 text-slate-400">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={isChecked}
        aria-label={label}
        data-state={isChecked ? 'checked' : 'unchecked'}
        disabled={disabled}
        onClick={() => onChange(!isChecked)}
        className={`inline-flex h-6 w-10 shrink-0 items-center justify-start rounded-full border p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 disabled:cursor-not-allowed disabled:opacity-50 ${
          isChecked ? 'border-cyan-400 bg-cyan-500' : 'border-slate-700 bg-[#151B2B]'
        }`}
      >
        <span
          className={`h-4 w-4 shrink-0 rounded-full bg-cyan-50 transition-transform ${
            isChecked ? 'translate-x-[18px]' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

function SettingsLoadingSkeleton() {
  return (
    <section className="mx-auto w-full max-w-3xl">
      <div className="h-3 w-20 animate-pulse rounded-md bg-slate-800/50" />
      <div className="mt-4 h-9 w-64 animate-pulse rounded-md bg-slate-800/50" />
      <div className="mt-8 space-y-4 rounded-md border border-blue-950/50 bg-[#090d1f]/40 p-5 backdrop-blur-md">
        <div className="h-10 animate-pulse rounded-md bg-slate-800/50" />
        <div className="h-10 animate-pulse rounded-md bg-slate-800/50" />
        <div className="h-10 w-28 animate-pulse rounded-md bg-slate-800/50" />
      </div>
    </section>
  );
}

function SettingsHeader({ tab }: { tab: SettingsTab }) {
  const details = getSettingsTab(tab);
  const titleId = `settings-${tab}-title`;

  return (
    <header>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Settings</p>
      <h2 id={titleId} className="mt-3 text-2xl font-semibold tracking-tight text-slate-200 sm:text-3xl">
        {details.label}
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">{details.description}</p>
    </header>
  );
}

function AccountSettings({
  save,
  settings,
}: {
  save: SettingsSave;
  settings: PersistedSettings;
}) {
  const { supabase, user } = useSettingsViewer();
  const router = useRouter();
  const [username, setUsername] = useState(settings.username ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [usernameSuccess, setUsernameSuccess] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [dangerAction, setDangerAction] = useState<'vault' | 'account' | null>(null);

  useEffect(() => setUsername(settings.username ?? ''), [settings.username]);

  const hasPasswordIdentity = useMemo(() => {
    const providers = user?.app_metadata?.providers;
    return (
      user?.identities?.some((identity) => identity.provider === 'email') ||
      (Array.isArray(providers) && providers.some((provider) => provider === 'email'))
    );
  }, [user]);

  const saveUsername = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingUsername(true);
    setUsernameError(null);
    setUsernameSuccess(null);
    try {
      const next = await save({ username });
      setUsername(next.username ?? '');
      setUsernameSuccess('Profile URL saved.');
    } catch (error) {
      setUsernameError(getErrorMessage(error, 'Unable to save profile URL.'));
    } finally {
      setSavingUsername(false);
    }
  };

  const updatePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !user?.email) {
      setPasswordError('Password management is unavailable for this session.');
      return;
    }
    if (!currentPassword || !newPassword) {
      setPasswordError('Enter both your current and new password.');
      return;
    }

    setSavingPassword(true);
    setPasswordError(null);
    setPasswordSuccess(null);
    try {
      const { error: reauthenticationError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (reauthenticationError) throw reauthenticationError;

      const { error: passwordUpdateError } = await supabase.auth.updateUser({ password: newPassword });
      if (passwordUpdateError) throw passwordUpdateError;

      setCurrentPassword('');
      setNewPassword('');
      setPasswordSuccess('Password updated.');
    } catch (error) {
      setPasswordError(getErrorMessage(error, 'Unable to update password.'));
    } finally {
      setSavingPassword(false);
    }
  };

  const completeDeletion = async (action: 'vault' | 'account') => {
    const endpoint = action === 'vault' ? '/api/settings/vault' : '/api/settings/account';
    const confirmation = action === 'vault' ? 'ERASE VAULT' : 'DELETE ACCOUNT';
    const response = await fetch(endpoint, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      throw new Error(body?.error ?? 'Unable to complete this action.');
    }

    if (action === 'account') {
      await supabase?.auth.signOut();
      clearPersistedAuthState();
      router.replace('/auth');
      return;
    }

    setDangerAction(null);
  };

  return (
    <section aria-labelledby="settings-account-title" className="mx-auto w-full max-w-3xl">
      <SettingsHeader tab="account" />

      <div className="mt-8 rounded-md border border-blue-950/50 bg-[#090d1f]/40 p-5 backdrop-blur-md sm:p-6">
        <Section>
          <form onSubmit={saveUsername}>
            <FieldLabel htmlFor="settings-username">Profile URL</FieldLabel>
            <div className="flex overflow-hidden rounded-md border border-blue-950/50 bg-[#050b1b]/60 transition focus-within:border-cyan-500 focus-within:ring-2 focus-within:ring-cyan-500/50">
              <span className="flex items-center border-r border-blue-950/50 px-3 text-sm text-slate-500">
                meliusai.in/profile/
              </span>
              <input
                id="settings-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm text-slate-200 outline-none"
              />
            </div>
            <p className="mt-2 text-sm text-slate-500">Lowercase letters, numbers, and underscores are used in your public URL.</p>
            <div className="mt-4 flex items-center gap-3">
              <button type="submit" disabled={savingUsername} className={primaryButtonClassName}>
                {savingUsername ? 'Saving…' : 'Save profile URL'}
              </button>
            </div>
            <FormNotice error={usernameError} success={usernameSuccess} />
          </form>
        </Section>

        <Section>
          <FieldLabel htmlFor="settings-email">Primary email</FieldLabel>
          <input id="settings-email" value={user?.email ?? ''} readOnly className={inputClassName} />
          <p className="mt-2 text-sm text-slate-500">Your primary email is managed by your sign-in provider.</p>
        </Section>

        <Section>
          <h3 className="text-base font-medium text-slate-200">Password management</h3>
          {hasPasswordIdentity ? (
            <form className="mt-4 space-y-4" onSubmit={updatePassword}>
              <div>
                <FieldLabel htmlFor="settings-current-password">Current password</FieldLabel>
                <input
                  id="settings-current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  className={inputClassName}
                />
              </div>
              <div>
                <FieldLabel htmlFor="settings-new-password">New password</FieldLabel>
                <input
                  id="settings-new-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className={inputClassName}
                />
              </div>
              <button type="submit" disabled={savingPassword} className={primaryButtonClassName}>
                {savingPassword ? 'Updating…' : 'Update password'}
              </button>
              <FormNotice error={passwordError} success={passwordSuccess} />
            </form>
          ) : (
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Your account uses an OAuth provider, so password changes are managed through that provider.
            </p>
          )}
        </Section>

        <Section className="pb-0">
          <div className="rounded-md border border-red-900/50 bg-red-950/10 p-4">
            <h3 className="text-base font-medium text-red-200">Danger zone</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              These actions are permanent. You must type an explicit confirmation before anything is deleted.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" onClick={() => setDangerAction('vault')} className={destructiveButtonClassName}>
                Erase Vault Data
              </button>
              <button type="button" onClick={() => setDangerAction('account')} className={destructiveButtonClassName}>
                Delete Account
              </button>
            </div>
          </div>
        </Section>
      </div>

      {dangerAction ? (
        <ConfirmationDialog
          action={dangerAction}
          onCancel={() => setDangerAction(null)}
          onConfirm={() => completeDeletion(dangerAction)}
        />
      ) : null}
    </section>
  );
}

function ConfirmationDialog({
  action,
  onCancel,
  onConfirm,
}: {
  action: 'vault' | 'account';
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const phrase = action === 'vault' ? 'ERASE VAULT' : 'DELETE ACCOUNT';
  const title = action === 'vault' ? 'Erase all Vault data?' : 'Delete your account?';
  const [value, setValue] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (value !== phrase) return;
    setPending(true);
    setError(null);
    try {
      await onConfirm();
    } catch (actionError) {
      setError(getErrorMessage(actionError, 'Unable to complete this action.'));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050b17]/85 p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="settings-danger-title" className="w-full max-w-md rounded-md border border-red-900/50 bg-[#090d1f] p-5 text-slate-200 shadow-2xl">
        <h3 id="settings-danger-title" className="text-lg font-semibold text-slate-200">{title}</h3>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Type <span className="font-medium text-red-200">{phrase}</span> to confirm. This cannot be undone.
        </p>
        <input value={value} onChange={(event) => setValue(event.target.value)} className={`${inputClassName} mt-4`} autoFocus />
        <FormNotice error={error} />
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onCancel} disabled={pending} className={secondaryButtonClassName}>Cancel</button>
          <button type="button" onClick={submit} disabled={value !== phrase || pending} className={destructiveButtonClassName}>
            {pending ? 'Deleting…' : action === 'vault' ? 'Erase Vault Data' : 'Delete Account'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PublicProfileSettings({ save, settings }: { save: SettingsSave; settings: PersistedSettings }) {
  const [draft, setDraft] = useState<{
    public_profile_enabled: boolean;
    public_scorecard_enabled: boolean;
    public_contact_email_enabled: boolean;
    current_status: Exclude<PersistedSettings['current_status'], null> | '';
  }>({
    public_profile_enabled: settings.public_profile_enabled,
    public_scorecard_enabled: settings.public_scorecard_enabled,
    public_contact_email_enabled: settings.public_contact_email_enabled,
    current_status: settings.current_status ?? '',
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setDraft({
      public_profile_enabled: settings.public_profile_enabled,
      public_scorecard_enabled: settings.public_scorecard_enabled,
      public_contact_email_enabled: settings.public_contact_email_enabled,
      current_status: settings.current_status ?? '',
    });
  }, [settings]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      await save({ ...draft, current_status: draft.current_status || null });
      setSuccess('Public profile preferences saved.');
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to save public profile preferences.'));
    } finally {
      setPending(false);
    }
  };

  return (
    <section aria-labelledby="settings-public-profile-title" className="mx-auto w-full max-w-3xl">
      <SettingsHeader tab="public-profile" />
      <form onSubmit={submit} className="mt-8 rounded-md border border-blue-950/50 bg-[#090d1f]/40 p-5 backdrop-blur-md sm:p-6">
        <Section>
          <div className="space-y-3">
            <SettingsToggle
              label="Global Profile Visibility"
              description={draft.public_profile_enabled ? 'Public — anyone with your profile URL can view it.' : 'Private — shared profile and Vault links return as unavailable to visitors.'}
              checked={draft.public_profile_enabled}
              onChange={(value) => setDraft((current) => ({ ...current, public_profile_enabled: value }))}
            />
            <SettingsToggle
              label="Scorecard Visibility"
              description="Show Validation Stream entries and AI audit scores to public visitors."
              checked={draft.public_scorecard_enabled}
              onChange={(value) => setDraft((current) => ({ ...current, public_scorecard_enabled: value }))}
            />
            <SettingsToggle
              label="Contact Info Display"
              description="Show your primary email address on your public profile."
              checked={draft.public_contact_email_enabled}
              onChange={(value) => setDraft((current) => ({ ...current, public_contact_email_enabled: value }))}
            />
          </div>
        </Section>
        <Section>
          <FieldLabel htmlFor="settings-current-status">Current status</FieldLabel>
          <select
            id="settings-current-status"
            value={draft.current_status}
            onChange={(event) => setDraft((current) => ({ ...current, current_status: event.target.value as Exclude<PersistedSettings['current_status'], null> | '' }))}
            className={inputClassName}
          >
            <option value="">Not specified</option>
            {CURRENT_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </Section>
        <div className="flex items-center gap-3 pt-1">
          <button type="submit" disabled={pending} className={primaryButtonClassName}>{pending ? 'Saving…' : 'Save preferences'}</button>
        </div>
        <FormNotice error={error} success={success} />
      </form>
    </section>
  );
}

function VaultDefaultsSettings({ save, settings }: { save: SettingsSave; settings: PersistedSettings }) {
  const [isPublic, setIsPublic] = useState(settings.default_asset_is_public);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  useEffect(() => setIsPublic(settings.default_asset_is_public), [settings.default_asset_is_public]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true); setError(null); setSuccess(null);
    try {
      await save({ default_asset_is_public: isPublic });
      setSuccess('Vault default saved.');
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to save Vault default.'));
    } finally { setPending(false); }
  };

  return (
    <section aria-labelledby="settings-vault-title" className="mx-auto w-full max-w-3xl">
      <SettingsHeader tab="vault" />
      <form onSubmit={submit} className="mt-8 rounded-md border border-blue-950/50 bg-[#090d1f]/40 p-5 backdrop-blur-md sm:p-6">
        <Section>
          <FieldLabel htmlFor="settings-asset-privacy">Default asset privacy</FieldLabel>
          <select id="settings-asset-privacy" value={isPublic ? 'public' : 'private'} onChange={(event) => setIsPublic(event.target.value === 'public')} className={inputClassName}>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
          <p className="mt-2 text-sm leading-6 text-slate-500">This applies to newly uploaded manual Vault assets. GitHub imports keep the repository privacy they were imported with.</p>
        </Section>
        <button type="submit" disabled={pending} className={primaryButtonClassName}>{pending ? 'Saving…' : 'Save Vault default'}</button>
        <FormNotice error={error} success={success} />
      </form>
    </section>
  );
}

function IntegrationsSettings() {
  const { setProfile, supabase, user } = useSettingsViewer();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userId = user?.id;
  const {
    data: connection,
    error: connectionError,
    mutate: mutateConnection,
  } = useSWR(
    userId ? workspaceCacheKeys.githubConnection(userId) : null,
    async () => {
      const response = await fetch('/api/github/connection', { credentials: 'include', cache: 'no-store' });
      const payload = (await response.json().catch(() => null)) as { connected?: boolean; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to load GitHub connection.');
      return { connected: payload?.connected === true };
    },
    { revalidateIfStale: false, revalidateOnMount: false }
  );
  const connected = connection?.connected ?? (connectionError ? false : undefined);

  const hasGitHubIdentity = user?.identities?.some((identity) => identity.provider === 'github') ?? false;

  const connect = async () => {
    if (!supabase) { setError('GitHub setup is unavailable because authentication is not configured.'); return; }
    setPending(true); setError(null);
    try {
      if (hasGitHubIdentity) {
        const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent('/settings/integrations')}`;
        const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
          provider: 'github',
          options: { scopes: 'repo read:user user:email', redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'consent' } },
        });
        if (oauthError || !data.url) throw oauthError ?? new Error('GitHub OAuth did not return an authorization URL.');
        window.location.assign(data.url);
        return;
      }
      const { data, error: linkError } = await supabase.auth.linkIdentity({
        provider: 'github',
        options: { scopes: 'repo', redirectTo: `${window.location.origin}/profile/setup-app`, skipBrowserRedirect: true },
      });
      if (linkError || !data.url) throw linkError ?? new Error('GitHub OAuth did not return an authorization URL.');
      window.location.assign(data.url);
    } catch (connectionError) {
      setError(getErrorMessage(connectionError, 'Unable to start GitHub connection.'));
      setPending(false);
    }
  };

  const disconnect = async () => {
    if (!supabase || !user) return;
    setPending(true); setError(null);
    try {
      const connectionResponse = await fetch('/api/github/connection', { method: 'DELETE', credentials: 'include', cache: 'no-store' });
      if (!connectionResponse.ok) throw new Error('Unable to remove the saved GitHub connection.');
      const { data: activeData, error: activeError } = await supabase.auth.getUser();
      if (activeError) throw activeError;
      const identity = activeData.user?.identities?.find((item) => item.provider === 'github');
      if (identity) {
        const { error: unlinkError } = await supabase.auth.unlinkIdentity(identity);
        if (unlinkError) throw unlinkError;
      }
      const { error: profileError } = await supabase.from('profiles').update({ github_username: null, github_user_id: null }).eq('id', user.id);
      if (profileError) throw profileError;
      setProfile((current) => current?.id === user.id ? { ...current, github_username: null, is_github_linked: false } : current);
      await mutateConnection({ connected: false }, { revalidate: false });
      await supabase.auth.refreshSession();
    } catch (disconnectError) {
      setError(getErrorMessage(disconnectError, 'Unable to disconnect GitHub.'));
    } finally { setPending(false); }
  };

  return (
    <section aria-labelledby="settings-integrations-title" className="mx-auto w-full max-w-3xl">
      <SettingsHeader tab="integrations" />
      <div className="mt-8 rounded-md border border-blue-950/50 bg-[#090d1f]/40 p-5 backdrop-blur-md sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="grid h-11 w-11 place-items-center rounded-md border border-blue-950/50 bg-[#050b1b]/60"><GitHubMark className="h-5 w-5 text-cyan-100" /></div>
            <div><h3 className="text-base font-medium text-slate-200">GitHub</h3><p className="mt-1 text-sm text-slate-400">{connected === undefined ? 'Checking connection…' : connected ? 'Connected securely' : 'Not connected'}</p></div>
          </div>
          <button type="button" disabled={pending || connected === undefined} onClick={connected ? disconnect : connect} className={connected ? secondaryButtonClassName : primaryButtonClassName}>
            {pending ? 'Working…' : connected ? 'Disconnect' : hasGitHubIdentity ? 'Reconnect' : 'Connect'}
          </button>
        </div>
        <FormNotice error={error ?? (connectionError ? getErrorMessage(connectionError, 'Unable to load GitHub connection.') : null)} />
      </div>
    </section>
  );
}

function NotificationsSettings({ save, settings }: { save: SettingsSave; settings: PersistedSettings }) {
  const [draft, setDraft] = useState({ audit_alerts_enabled: settings.audit_alerts_enabled, opportunity_match_alerts_enabled: settings.opportunity_match_alerts_enabled });
  const [pending, setPending] = useState(false); const [error, setError] = useState<string | null>(null); const [success, setSuccess] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false); const [pushSupported, setPushSupported] = useState(true); const [pushPending, setPushPending] = useState(false); const [pushError, setPushError] = useState<string | null>(null);
  useEffect(() => setDraft({ audit_alerts_enabled: settings.audit_alerts_enabled, opportunity_match_alerts_enabled: settings.opportunity_match_alerts_enabled }), [settings]);
  useEffect(() => {
    let active = true;
    void getWebPushStatus().then((status) => {
      if (!active) return;
      setPushSupported(status.supported);
      setPushEnabled(status.enabled);
    }).catch((statusError) => {
      if (active) setPushError(getErrorMessage(statusError, 'Unable to read browser push settings.'));
    });
    return () => { active = false; };
  }, []);
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setPending(true); setError(null); setSuccess(null); try { await save(draft); setSuccess('Notification preferences saved.'); } catch (saveError) { setError(getErrorMessage(saveError, 'Unable to save notification preferences.')); } finally { setPending(false); } };
  const togglePush = async (nextEnabled: boolean) => {
    if (pushPending || !pushSupported) return;
    setPushPending(true); setPushError(null);
    try {
      if (nextEnabled) await enableWebPush(); else await disableWebPush();
      setPushEnabled(nextEnabled);
    } catch (toggleError) {
      setPushError(getErrorMessage(toggleError, 'Unable to update Web Push for this browser.'));
    } finally { setPushPending(false); }
  };
  return (
    <section aria-labelledby="settings-notifications-title" className="mx-auto w-full max-w-3xl">
      <SettingsHeader tab="notifications" />
      <form onSubmit={submit} className="mt-8 rounded-md border border-blue-950/50 bg-[#090d1f]/40 p-5 backdrop-blur-md sm:p-6">
        <Section><div className="space-y-3"><SettingsToggle label="Audit Alerts" description="Receive emails when a manual Vault audit completes." checked={draft.audit_alerts_enabled} onChange={(value) => setDraft((current) => ({ ...current, audit_alerts_enabled: value }))} /><SettingsToggle label="Opportunity Matches" description="Receive emails for future recruiter and bounty matches." checked={draft.opportunity_match_alerts_enabled} onChange={(value) => setDraft((current) => ({ ...current, opportunity_match_alerts_enabled: value }))} /><SettingsToggle label="Push Notifications" description={pushSupported ? 'Receive native MeliusAI notifications on this browser. Other devices are managed separately.' : 'Web Push requires a supported browser over HTTPS.'} checked={pushEnabled} disabled={pushPending || !pushSupported} onChange={(value) => void togglePush(value)} /></div></Section>
        <button type="submit" disabled={pending} className={primaryButtonClassName}>{pending ? 'Saving…' : 'Save notifications'}</button><FormNotice error={error} success={success} />
        <FormNotice error={pushError} />
      </form>
    </section>
  );
}

function BillingSettings() {
  return (
    <section aria-labelledby="settings-billing-title" className="mx-auto w-full max-w-3xl">
      <SettingsHeader tab="billing" />
      <div className="mt-8 space-y-5">
        <div className="rounded-md border border-blue-950/50 bg-[#090d1f]/40 p-5 backdrop-blur-md sm:p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><h3 className="text-base font-medium text-slate-200">Current plan</h3><p className="mt-1 text-sm text-slate-400">Your workspace is on the Free Tier.</p></div><span className="rounded-md border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1 text-xs font-medium text-cyan-100">Free Tier</span></div></div>
        <div className="rounded-md border border-blue-950/50 bg-[#090d1f]/40 p-5 opacity-80 backdrop-blur-md sm:p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><h3 className="text-base font-medium text-slate-200">Pro Features</h3><p className="mt-1 text-sm text-slate-400">More automation and customization are on the way.</p></div><span className="rounded-md border border-blue-950/60 bg-[#071329]/60 px-2.5 py-1 text-xs font-medium text-slate-300">Coming Soon</span></div><ul className="mt-5 space-y-2 text-sm text-slate-400"><li>Automatic GitHub Imports &amp; Audits</li><li>Unlimited AI Audits</li><li>Custom Domains</li></ul><button type="button" disabled className={`${secondaryButtonClassName} mt-5`}>Upgrade to Pro</button></div>
      </div>
    </section>
  );
}

export function SettingsTabContent({ tab }: { tab: SettingsTab }) {
  const { setProfile, user } = useSettingsViewer();
  const userId = user?.id;
  const {
    data: settings,
    error,
    mutate: mutateSettings,
  } = useSWR<PersistedSettings>(
    userId ? workspaceCacheKeys.settings(userId) : null,
    async () => {
      const response = await fetch('/api/settings', { credentials: 'include', cache: 'no-store' });
      const body = (await response.json().catch(() => null)) as { settings?: PersistedSettings; error?: string } | null;
      if (!response.ok || !body?.settings) throw new Error(body?.error ?? 'Unable to load settings.');
      return body.settings;
    },
    { revalidateIfStale: false, revalidateOnMount: false }
  );

  const save = useCallback(async (update: Partial<PersistedSettings>) => {
    const response = await fetch('/api/settings', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update) });
    const body = (await response.json().catch(() => null)) as { settings?: PersistedSettings; error?: string } | null;
    if (!response.ok || !body?.settings) throw new Error(body?.error ?? 'Unable to save settings.');
    await mutateSettings(body.settings, { revalidate: false });
    setProfile((current) => current ? { ...current, ...body.settings } : current);
    return body.settings;
  }, [mutateSettings, setProfile]);

  if (!user) {
    return <section className="mx-auto w-full max-w-3xl rounded-md border border-blue-950/50 bg-[#090d1f]/40 p-5 text-sm text-slate-400 backdrop-blur-md">Settings are unavailable until you sign in.</section>;
  }

  if (!settings) {
    return error ? <section className="mx-auto w-full max-w-3xl rounded-md border border-blue-950/50 bg-[#090d1f]/40 p-5 text-sm text-red-300 backdrop-blur-md" role="alert">{getErrorMessage(error, 'Unable to load settings.')}</section> : <SettingsLoadingSkeleton />;
  }

  if (tab === 'account') return <AccountSettings settings={settings} save={save} />;
  if (tab === 'public-profile') return <PublicProfileSettings settings={settings} save={save} />;
  if (tab === 'vault') return <VaultDefaultsSettings settings={settings} save={save} />;
  if (tab === 'integrations') return <IntegrationsSettings />;
  if (tab === 'notifications') return <NotificationsSettings settings={settings} save={save} />;
  return <BillingSettings />;
}
