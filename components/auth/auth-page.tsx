'use client';

import type { Provider } from '@supabase/supabase-js';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { clearPersistedAuthState, persistAuthenticatedRouteState, persistAuthenticatedUser } from '@/lib/auth-session-routing';
import { cn } from '@/lib/utils';
import { getDashboardHref, useViewerProfile } from '@/lib/viewer-client';
import type { UserRole } from '@/types/supabase';

const ROLE_STORAGE_KEY = 'meliusai-auth-role';
const GENERIC_ORGANISATION_DOMAINS = new Set([
  'gmail.com',
  'hotmail.com',
  'icloud.com',
  'live.com',
  'outlook.com',
  'yahoo.com',
]);
const AUTH_CONNECTION_ERROR =
  'Connection Error: we could not connect to sign in right now. Please try again soon.';
const AUTH_CONFIGURATION_ERROR = 'Configuration Error: Please check your environment keys.';
const AUTH_NETWORK_ERROR =
  'Cannot reach the server. Please check your internet connection or try again later.';
const SUPABASE_PUBLIC_CONFIG_READY = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

type RoleDescriptor = {
  role: UserRole;
  badge: 'accent' | 'creative';
  eyebrow: string;
  title: string;
  description: string;
  hoverGlow: string;
  border: string;
  iconShell: string;
  accentText: string;
  entryLabel: string;
  panelBorder: string;
  panelAura: string;
  formTitle: string;
  formDescription: string;
  panelNote: string;
  points: [string, string, string];
};

const roleDescriptors: Record<UserRole, RoleDescriptor> = {
  talent: {
    role: 'talent',
    badge: 'accent',
    eyebrow: 'Elite Talent',
    title: 'Individual Talent',
    description: 'Save your work. Get clear feedback. Grow faster.',
    hoverGlow: 'hover:border-sky-400/40 hover:shadow-[0_24px_120px_rgba(0,112,243,0.25)]',
    border: 'border-sky-500/20',
    iconShell: 'border-sky-400/30 bg-sky-500/10 text-sky-200 shadow-[0_0_40px_rgba(0,112,243,0.28)]',
    accentText: 'text-sky-300',
    entryLabel: 'For your work',
    panelBorder: 'border-sky-400/25',
    panelAura: 'bg-[radial-gradient(circle_at_top_left,rgba(0,112,243,0.18),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.12),transparent_35%)]',
    formTitle: 'Sign In as Individual Talent',
    formDescription: 'Launch your independent vault, preserve your work trail, and let MeliusAI help you get the most out of it.',
    panelNote: 'Email sign-in opens your secure individual vault.',
    points: ['Save your projects', 'Get a clear review', 'Grow step by step'],
  },
  recruiter: {
    role: 'recruiter',
    badge: 'creative',
    eyebrow: 'Verified Partner',
    title: 'Verified Organisation',
    description: 'Find reviewed talent. Hire with more confidence.',
    hoverGlow: 'hover:border-fuchsia-400/40 hover:shadow-[0_24px_120px_rgba(139,92,246,0.24)]',
    border: 'border-fuchsia-500/20',
    iconShell: 'border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-100 shadow-[0_0_40px_rgba(139,92,246,0.24)]',
    accentText: 'text-fuchsia-200',
    entryLabel: 'For hiring teams',
    panelBorder: 'border-fuchsia-400/25',
    panelAura: 'bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.18),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.12),transparent_35%)]',
    formTitle: 'Sign In',
    formDescription: 'Sign in to review talent and manage hiring.',
    panelNote: 'Use LinkedIn or your work email to sign in. Personal email addresses are not allowed here.',
    points: ['See reviewed talent', 'Keep hiring organized', 'Use your work domain'],
  },
};

function saveRoleIntent(role: UserRole) {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(ROLE_STORAGE_KEY, role);
}

function clearRoleIntent() {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.removeItem(ROLE_STORAGE_KEY);
}

function getEmailDomain(email: string) {
  return email.trim().toLowerCase().split('@')[1] ?? '';
}

function isGenericOrganisationEmail(email: string) {
  const domain = getEmailDomain(email);
  return domain.length > 0 && GENERIC_ORGANISATION_DOMAINS.has(domain);
}

function isFailedFetchError(authError: unknown) {
  if (!(authError instanceof Error)) {
    return false;
  }

  const message = authError.message.toLowerCase();
  return message.includes('failed to fetch') || message.includes('fetch failed');
}

function getFriendlyAuthError(authError: unknown, fallback: string) {
  if (isFailedFetchError(authError)) {
    return AUTH_NETWORK_ERROR;
  }

  return authError instanceof Error ? authError.message : fallback;
}

function getAuthErrorMessage(authError: unknown) {
  if (authError instanceof Error) {
    return authError.message;
  }

  if (typeof authError === 'object' && authError && 'message' in authError) {
    const message = (authError as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
  }

  return String(authError);
}

function LogicPrismLogo() {
  return (
    <div className="relative mx-auto mb-6 flex h-28 w-28 items-center justify-center">
      <div className="absolute inset-0 rounded-[2rem] border border-white/10 bg-white/[0.04] shadow-[0_24px_80px_rgba(15,23,42,0.5)] backdrop-blur-2xl" />
      <div className="absolute inset-[18px] rotate-45 rounded-[1.35rem] bg-gradient-to-br from-sky-400/70 via-cyan-400/15 to-fuchsia-500/70 blur-[1px]" />
      <div className="relative flex h-16 w-16 items-center justify-center rounded-[1.35rem] border border-white/15 bg-slate-950/80 text-sm font-semibold tracking-[0.32em] text-white">
        MAI
      </div>
    </div>
  );
}

type ProviderOptionButtonProps = {
  activeGlow: string;
  caption: string;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  pending?: boolean;
};

function ProviderOptionButton({
  activeGlow,
  caption,
  disabled = false,
  label,
  onClick,
  pending = false,
}: ProviderOptionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'group relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-5 text-left transition duration-300 backdrop-blur-xl',
        activeGlow,
        disabled && 'cursor-not-allowed opacity-60'
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white/8 via-transparent to-transparent opacity-80" />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-base font-semibold text-white">{pending ? 'Redirecting...' : label}</p>
          <p className="mt-2 text-sm leading-6 text-slate-400">{caption}</p>
        </div>
        <div className="rounded-full border border-white/10 bg-slate-950/70 px-3 py-1 text-xs uppercase tracking-[0.18em] text-slate-300">
          OAuth
        </div>
      </div>
    </button>
  );
}

function ButtonSpinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950/25 border-t-slate-950"
    />
  );
}

export function AuthPage() {
  const router = useRouter();
  const { authEnabled, error: viewerError, loading, profile, supabase, user } = useViewerProfile();
  const [selectedRole, setSelectedRole] = useState<UserRole | null>('talent');
  const [hasLoadedIntent, setHasLoadedIntent] = useState(false);
  const [individualMode, setIndividualMode] = useState<'signin' | 'signup'>('signin');
  const [individualFullName, setIndividualFullName] = useState('');
  const [individualUsername, setIndividualUsername] = useState('');
  const [individualBirthDate, setIndividualBirthDate] = useState('');
  const [individualEmail, setIndividualEmail] = useState('');
  const [individualPassword, setIndividualPassword] = useState('');
  const [showIndividualPassword, setShowIndividualPassword] = useState(false);
  const [workEmail, setWorkEmail] = useState('');
  const [pendingAction, setPendingAction] = useState<'linkedin' | 'sso' | 'vault' | null>(null);
  const [pendingSync, setPendingSync] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const existingDestination = profile?.role_selected_at ? getDashboardHref(profile.role) : null;
  const activeRole = selectedRole ? roleDescriptors[selectedRole] : null;
  const normalizedVaultUsername = individualUsername.trim().replace(/^@+/, '');
  const isIndividualSignInReady = Boolean(individualEmail.trim() && individualPassword);
  const isIndividualSignUpReady = Boolean(
    individualFullName.trim() &&
      normalizedVaultUsername &&
      individualBirthDate.trim() &&
      individualEmail.trim() &&
      individualPassword
  );
  const isVaultPending = pendingAction === 'vault';
  const isIndividualVaultDisabled =
    pendingAction === 'vault' ||
    !authEnabled ||
    !SUPABASE_PUBLIC_CONFIG_READY ||
    (individualMode === 'signup' ? !isIndividualSignUpReady : !isIndividualSignInReady);

  useEffect(() => {
    setSelectedRole('talent');
    clearRoleIntent();
    setHasLoadedIntent(true);
  }, []);

  useEffect(() => {
    if (viewerError) {
      setError(viewerError);
    }
  }, [viewerError]);

  useEffect(() => {
    if (profile?.role_selected_at) {
      clearRoleIntent();
    }
  }, [profile?.role_selected_at]);

  useEffect(() => {
    if (!hasLoadedIntent || !user || !profile || !selectedRole || profile.role_selected_at || pendingSync) {
      return;
    }

    let active = true;

    const syncRole = async () => {
      setPendingSync(true);
      setError(null);
      setMessage('Getting your account ready...');

      try {
        const response = await fetch('/api/auth/profile', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            role: selectedRole,
            role_selected_at: new Date().toISOString(),
          }),
        });

        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        if (!response.ok) {
          throw new Error(body?.error ?? 'We could not open this page.');
        }

        clearRoleIntent();
        router.replace(getDashboardHref(selectedRole));
        router.refresh();
      } catch (syncError) {
        if (!active) {
          return;
        }

        clearRoleIntent();
        setSelectedRole('talent');
        setMessage(null);
        setError(syncError instanceof Error ? syncError.message : 'Unable to secure this path.');
      } finally {
        if (active) {
          setPendingSync(false);
        }
      }
    };

    void syncRole();

    return () => {
      active = false;
    };
  }, [hasLoadedIntent, pendingSync, profile, router, selectedRole, user]);

  async function beginOAuth(provider: Provider) {
    if (!selectedRole) {
      return;
    }

    if (!authEnabled || !supabase) {
      setError(AUTH_CONNECTION_ERROR);
      return;
    }

    const redirectTo = `${window.location.origin}/auth/login`;

    setPendingAction('linkedin');
    setError(null);
    setMessage(null);
    saveRoleIntent(selectedRole);

    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
        },
      });

      if (oauthError) {
        throw oauthError;
      }
    } catch (oauthFailure) {
      setPendingAction(null);
      setError(oauthFailure instanceof Error ? oauthFailure.message : 'We could not open that sign-in.');
    }
  }

  async function initializeIndividualVault(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedRole) {
      return;
    }

    const email = individualEmail.trim().toLowerCase();
    const normalizedUsername = individualUsername.trim().replace(/^@+/, '').toLowerCase();
    const birthDateValue = individualBirthDate.trim();

    if (individualMode === 'signup') {
      if (!individualFullName.trim() || !normalizedUsername || !birthDateValue || !email || !individualPassword) {
        setError('Fill in every field first.');
        setMessage(null);
        return;
      }

      if (!/^[a-z0-9_]{3,24}$/i.test(normalizedUsername)) {
        setError('Use 3 to 24 letters, numbers, or underscores.');
        setMessage(null);
        return;
      }

      const parsedBirthDate = new Date(`${birthDateValue}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (Number.isNaN(parsedBirthDate.getTime()) || parsedBirthDate > today) {
        setError('Enter a valid birth date.');
        setMessage(null);
        return;
      }

      let age = today.getFullYear() - parsedBirthDate.getFullYear();
      const monthOffset = today.getMonth() - parsedBirthDate.getMonth();
      if (monthOffset < 0 || (monthOffset === 0 && today.getDate() < parsedBirthDate.getDate())) {
        age -= 1;
      }

      if (age < 18) {
        setError('You must be 18 or older.');
        setMessage(null);
        return;
      }
    } else if (!email || !individualPassword) {
      setError('Enter your email and password.');
      setMessage(null);
      return;
    }

    if (!SUPABASE_PUBLIC_CONFIG_READY || !authEnabled || !supabase) {
      setError(AUTH_CONFIGURATION_ERROR);
      setMessage(null);
      return;
    }

    setPendingAction('vault');
    setError(null);
    setMessage(null);
    saveRoleIntent(selectedRole);

    try {
      if (individualMode === 'signup') {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password: individualPassword,
          options: {
            data: {
              role: 'talent',
              display_name: individualFullName.trim(),
              full_name: individualFullName.trim(),
              username: normalizedUsername,
              birth_date: birthDateValue,
            },
          },
        });

        if (signUpError) {
          throw signUpError;
        }

        if (!signUpData.session) {
          setPendingAction(null);
          clearPersistedAuthState();
          setMessage('We sent you a quick email. Just click the link inside to verify your account and get started.');
          return;
        }

        if (signUpData.user) {
          persistAuthenticatedUser(signUpData.user);
        } else {
          persistAuthenticatedRouteState('individual');
        }
        setMessage('Your account is ready.');
        router.replace(`/profile/${encodeURIComponent(normalizedUsername || signUpData.user?.id || 'member')}`);
        return;
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: individualPassword,
      });

      if (signInError) {
        throw signInError;
      }

      const authRole =
        (data.user?.user_metadata?.role as string | undefined) ??
        ((data.user as { raw_user_meta_data?: { role?: string } } | null)?.raw_user_meta_data?.role);

      if (data.user && authRole === 'talent') {
        const profileHandle =
          ((data.user as { raw_user_meta_data?: { username?: string } } | null)?.raw_user_meta_data?.username) ||
          (data.user.user_metadata?.username as string | undefined) ||
          data.user.id;
        persistAuthenticatedUser(data.user);
        setMessage('Welcome back.');
        router.replace(`/profile/${encodeURIComponent(profileHandle)}`);
        return;
      }

      if (data.user) {
        clearPersistedAuthState();
        setPendingAction(null);
        setError('This account is not registered as an individual talent workspace.');
      }
    } catch (vaultError) {
      setPendingAction(null);
      setError(getAuthErrorMessage(vaultError));
    }
  }

  async function beginOrganisationSso(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedRole) {
      return;
    }

    const normalizedEmail = workEmail.trim().toLowerCase();
    const domain = getEmailDomain(normalizedEmail);

    if (!domain) {
      setError('Enter your work email.');
      setMessage(null);
      return;
    }

    if (isGenericOrganisationEmail(normalizedEmail)) {
      setError('Use your work email.');
      setMessage(null);
      return;
    }

    if (!authEnabled || !supabase) {
      setError(AUTH_CONNECTION_ERROR);
      setMessage(null);
      return;
    }

    setPendingAction('sso');
    setError(null);
    setMessage(null);
    saveRoleIntent(selectedRole);

    try {
      const { error: ssoError } = await supabase.auth.signInWithSSO({
        domain,
        options: {
          redirectTo: `${window.location.origin}/auth`,
        },
      });

      if (ssoError) {
        throw ssoError;
      }

      setMessage(`Opening your sign-in...`);
    } catch (ssoFailure) {
      setPendingAction(null);
      setError(ssoFailure instanceof Error ? ssoFailure.message : 'We could not start work email sign-in.');
    }
  }

  function handleRoleSelect(role: UserRole) {
    setSelectedRole(role);
    setPendingAction(null);
    setError(null);
    setMessage(null);
    setIndividualMode('signin');
    setIndividualFullName('');
    setIndividualUsername('');
    setIndividualBirthDate('');
    setIndividualEmail('');
    setIndividualPassword('');
    setWorkEmail('');
    saveRoleIntent(role);
  }

  function handleResetSelection() {
    clearRoleIntent();
    router.push('/auth');
    setPendingAction(null);
    setError(null);
    setMessage(null);
    setIndividualMode('signin');
    setIndividualFullName('');
    setIndividualUsername('');
    setIndividualBirthDate('');
    setIndividualEmail('');
    setIndividualPassword('');
    setWorkEmail('');
  }

  if (loading || !hasLoadedIntent || pendingSync) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-12 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,112,243,0.16),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(139,92,246,0.14),transparent_30%)]" />
        <Card className="relative w-full max-w-xl border-white/10 bg-white/[0.04] backdrop-blur-2xl">
          <CardHeader>
            <Badge variant="outline" className="w-fit">Getting ready</Badge>
            <CardTitle className="text-3xl">Loading...</CardTitle>
            <CardDescription className="text-base leading-7">
              Please wait a moment.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  if (user && existingDestination) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-12 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,112,243,0.16),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(139,92,246,0.16),transparent_30%)]" />
        <Card className="relative w-full max-w-2xl border-white/10 bg-white/[0.05] backdrop-blur-2xl">
          <CardHeader>
            <Badge variant="accent" className="w-fit">Already signed in</Badge>
            <CardTitle className="text-3xl">You are already signed in.</CardTitle>
            <CardDescription className="text-base leading-7">
              Go to your dashboard or head home.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button href={existingDestination}>Go to dashboard</Button>
            <Button variant="outline" href="/">Back home</Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-slate-950 px-4 py-12 sm:px-6 lg:px-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,112,243,0.18),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(14,165,233,0.12),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(139,92,246,0.16),transparent_32%)]" />
      <div className="absolute left-1/2 top-20 h-64 w-64 -translate-x-1/2 rounded-full bg-white/5 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center">
        <div className="mx-auto w-full max-w-5xl">
          <div className="text-center">
            <LogicPrismLogo />
            <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-slate-300">Welcome</Badge>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Individual Talent Sign In
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              Access your private vault with your email.
            </p>
            {!authEnabled ? (
              <div className="mx-auto mt-4 max-w-2xl rounded-[1.5rem] border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-left text-sm leading-6 text-rose-100">
                <p className="font-medium text-rose-100">Configuration Error</p>
                <p className="mt-1 text-rose-200/90">{AUTH_CONFIGURATION_ERROR}</p>
              </div>
            ) : null}
          </div>

          <LayoutGroup id="auth-role-gate">
            <div className="mt-10">
              <AnimatePresence initial={false} mode="wait">
                {!selectedRole ? (
                  <motion.div
                    key="role-grid"
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12, filter: 'blur(10px)' }}
                    transition={{ duration: 0.28, ease: 'easeOut' }}
                    className="grid gap-6 lg:grid-cols-2"
                  >
                    {(['talent', 'recruiter'] as UserRole[]).map((role, index) => {
                      const descriptor = roleDescriptors[role];

                      return (
                        <motion.button
                          key={role}
                          type="button"
                          layoutId={`auth-role-${role}`}
                          onClick={() => handleRoleSelect(role)}
                          whileHover={{ y: -10, scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          transition={{ type: 'spring', stiffness: 220, damping: 22 }}
                          className={cn(
                            'group relative overflow-hidden rounded-[2rem] border bg-white/[0.05] text-left backdrop-blur-2xl transition duration-300',
                            descriptor.border,
                            descriptor.hoverGlow
                          )}
                        >
                          <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent opacity-90" />
                          <div className={cn('absolute inset-0 opacity-70', descriptor.panelAura)} />
                          <div className="relative flex h-full flex-col p-7 sm:p-8">
                            <div className="flex items-start justify-between gap-6">
                              <div>
                                <Badge variant={descriptor.badge} className="w-fit">
                                  {descriptor.eyebrow}
                                </Badge>
                                <h2 className="mt-5 text-3xl font-semibold tracking-tight text-white sm:text-[2rem]">
                                  {descriptor.title}
                                </h2>
                                <p className="mt-4 text-base leading-7 text-slate-300">
                                  {descriptor.description}
                                </p>
                              </div>
                              <div className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border text-sm font-semibold', descriptor.iconShell)}>
                                {index + 1}
                              </div>
                            </div>

                            <div className="mt-8 grid gap-3">
                              {descriptor.points.map((point) => (
                                <div key={point} className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm leading-6 text-slate-300">
                                  {point}
                                </div>
                              ))}
                            </div>

                            <div className="mt-8 flex items-center justify-between gap-4 text-sm">
                              <span className={cn('font-medium', descriptor.accentText)}>{descriptor.entryLabel}</span>
                              <span className="text-slate-400">Choose this path</span>
                            </div>
                          </div>
                        </motion.button>
                      );
                    })}
                  </motion.div>
                ) : activeRole ? (
                  <motion.div
                    key={`auth-form-${selectedRole}`}
                    initial={{ opacity: 0, y: 22, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -16, scale: 0.96 }}
                    transition={{ duration: 0.28, ease: 'easeOut' }}
                    className={selectedRole === 'talent' ? 'mx-auto max-w-xl' : 'mx-auto max-w-3xl'}
                  >
                    <motion.div
                      layoutId={`auth-role-${selectedRole}`}
                      className={cn('relative overflow-hidden rounded-[2rem] border bg-white/[0.06] backdrop-blur-2xl', activeRole.panelBorder)}
                    >
                      <div className={cn('absolute inset-0 opacity-90', activeRole.panelAura)} />
                      <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent" />

                      <div className="relative p-6 sm:p-8">
                        <div className="flex flex-wrap items-start justify-center gap-4">
                          <div className={selectedRole === 'talent' ? 'mx-auto w-full max-w-md text-center' : 'max-w-2xl'}>
                            <Badge variant={activeRole.badge} className="w-fit">
                              {activeRole.title}
                            </Badge>
                            <h2
                              className={cn(
                                'mt-4 font-semibold tracking-tight text-white',
                                selectedRole === 'talent' ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-4xl'
                              )}
                            >
                              {selectedRole === 'talent' ? (individualMode === 'signup' ? 'Create Account' : 'Sign In') : activeRole.formTitle}
                            </h2>
                            {selectedRole === 'recruiter' ? (
                              <p className="mt-3 text-base leading-7 text-slate-300">
                                {activeRole.formDescription}
                              </p>
                            ) : null}
                          </div>
                        </div>

                        <div className="mt-8 space-y-5">
                          {selectedRole === 'talent' ? (
                            <div className="mx-auto max-w-md space-y-4">
                              <div className="grid grid-cols-2 gap-2 rounded-full border border-white/10 bg-slate-950/60 p-1">
                                <button
                                  type="button"
                                  onClick={() => { setIndividualMode('signin'); setError(null); setMessage(null); }}
                                  className={cn(
                                    'rounded-full px-4 py-2 text-sm font-medium transition',
                                    individualMode === 'signin'
                                      ? 'bg-sky-500 text-slate-950 shadow-[0_0_30px_rgba(0,112,243,0.2)]'
                                      : 'text-slate-300 hover:text-white'
                                  )}
                                >
                                  Sign In
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setIndividualMode('signup'); setError(null); setMessage(null); }}
                                  className={cn(
                                    'rounded-full px-4 py-2 text-sm font-medium transition',
                                    individualMode === 'signup'
                                      ? 'bg-sky-500 text-slate-950 shadow-[0_0_30px_rgba(0,112,243,0.2)]'
                                      : 'text-slate-300 hover:text-white'
                                  )}
                                >
                                  Create Account
                                </button>
                              </div>

                              <form className="space-y-4" onSubmit={(event) => void initializeIndividualVault(event)}>
                                {individualMode === 'signup' ? (
                                  <>
                                    <div className="grid gap-4 sm:grid-cols-2">
                                      <div className="space-y-2">
                                        <Label htmlFor="vault-full-name">Full Name</Label>
                                        <Input
                                          id="vault-full-name"
                                          autoComplete="name"
                                          className="border-white/10 bg-slate-950/60 focus:border-sky-500/60 focus:ring-sky-500/20"
                                          placeholder="Aarav Sharma"
                                          type="text"
                                          value={individualFullName}
                                          onChange={(event) => setIndividualFullName(event.target.value)}
                                        />
                                      </div>
                                      <div className="space-y-2">
                                        <Label htmlFor="vault-username">Username</Label>
                                        <Input
                                          id="vault-username"
                                          autoComplete="nickname"
                                          className="border-white/10 bg-slate-950/60 focus:border-sky-500/60 focus:ring-sky-500/20"
                                          placeholder="@username"
                                          type="text"
                                          value={individualUsername}
                                          onChange={(event) => setIndividualUsername(event.target.value)}
                                        />
                                        <p className="text-xs leading-5 text-slate-500">
                                          This will be your handle.
                                        </p>
                                      </div>
                                      <div className="space-y-2 sm:col-span-2">
                                        <Label htmlFor="vault-birth-date">Birth Date</Label>
                                        <Input
                                          id="vault-birth-date"
                                          className="border-white/10 bg-slate-950/60 focus:border-sky-500/60 focus:ring-sky-500/20"
                                          type="date"
                                          value={individualBirthDate}
                                          onChange={(event) => setIndividualBirthDate(event.target.value)}
                                        />
                                        <p className="text-xs leading-5 text-slate-500">
                                          We use this to confirm your age.
                                        </p>
                                      </div>
                                    </div>
                                  </>
                                ) : null}
                                <div className="space-y-2">
                                  <Label htmlFor="vault-email">Email</Label>
                                  <Input
                                    id="vault-email"
                                    autoComplete="email"
                                    className="border-white/10 bg-slate-950/60 focus:border-sky-500/60 focus:ring-sky-500/20"
                                    inputMode="email"
                                    placeholder="you@example.com"
                                    type="email"
                                    value={individualEmail}
                                    onChange={(event) => setIndividualEmail(event.target.value)}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="vault-password">Password</Label>
                                  <div className="relative flex items-center">
                                    <Input
                                      id="vault-password"
                                      autoComplete={individualMode === 'signup' ? 'new-password' : 'current-password'}
                                      className="border-white/10 bg-slate-950/60 pr-14 focus:border-sky-500/60 focus:ring-sky-500/20"
                                      placeholder={individualMode === 'signup' ? 'Create a password' : 'Your password'}
                                      type={showIndividualPassword ? 'text' : 'password'}
                                      value={individualPassword}
                                      onChange={(event) => setIndividualPassword(event.target.value)}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setShowIndividualPassword((value) => !value)}
                                      className="absolute right-3 text-[10px] font-bold tracking-widest text-slate-500 hover:text-slate-300 uppercase transition-colors select-none focus:outline-none"
                                    >
                                      {showIndividualPassword ? 'Hide' : 'Show'}
                                    </button>
                                  </div>
                                </div>
                                <Button className="w-full" size="lg" type="submit" disabled={isIndividualVaultDisabled}>
                                  {isVaultPending ? <ButtonSpinner /> : null}
                                  {isVaultPending
                                    ? individualMode === 'signup'
                                      ? 'Creating Account...'
                                      : 'Signing In...'
                                    : individualMode === 'signup'
                                      ? 'Create Account'
                                      : 'Sign In'}
                                </Button>
                              </form>

                              {error ? (
                                <div className="rounded-[1.5rem] border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                                  {error}
                                </div>
                              ) : null}
                              {message ? (
                                <div className="rounded-[1.5rem] border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                                  {message}
                                </div>
                              ) : null}

                              <button
                                type="button"
                                onClick={handleResetSelection}
                                className="block w-full text-center text-sm text-slate-500 transition hover:text-slate-200"
                              >
                                Switch Path
                              </button>
                            </div>
                          ) : (
                            <div className="grid gap-4 lg:grid-cols-[0.88fr_1.12fr]">
                              <ProviderOptionButton
                                activeGlow="hover:border-fuchsia-400/35 hover:shadow-[0_24px_80px_rgba(139,92,246,0.2)]"
                                caption="Use your LinkedIn account to sign in."
                                label="Sign in with LinkedIn"
                                onClick={() => void beginOAuth('linkedin')}
                                pending={pendingAction === 'linkedin'}
                              />
                              <form
                                className="rounded-[1.75rem] border border-white/10 bg-slate-950/45 p-5"
                                onSubmit={(event) => void beginOrganisationSso(event)}
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div>
                                    <p className="text-base font-semibold text-white">Work Email</p>
                                    <p className="mt-2 text-sm leading-6 text-slate-400">
                                      Use your work email to sign in.
                                    </p>
                                  </div>
                                  <div className="rounded-full border border-white/10 bg-slate-950/70 px-3 py-1 text-xs uppercase tracking-[0.18em] text-slate-300">
                                    SSO
                                  </div>
                                </div>
                                <div className="mt-5 space-y-3">
                                  <Label htmlFor="work-email">Work email</Label>
                                  <Input
                                    id="work-email"
                                    autoComplete="email"
                                    inputMode="email"
                                    placeholder="team@company.com"
                                    type="email"
                                    value={workEmail}
                                    onChange={(event) => setWorkEmail(event.target.value)}
                                  />
                                </div>
                                <Button className="mt-5 w-full" size="lg" type="submit" disabled={pendingAction === 'sso'}>
                                  {pendingAction === 'sso' ? 'Redirecting...' : 'Sign In'}
                                </Button>
                              </form>
                            </div>
                          )}

                          {selectedRole === 'recruiter' ? (
                            <>
                              <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/45 p-5">
                                <p className="text-sm leading-7 text-slate-300">{activeRole.panelNote}</p>
                              </div>

                              {error ? (
                                <div className="rounded-[1.75rem] border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                                  {error}
                                </div>
                              ) : null}
                              {message ? (
                                <div className="rounded-[1.75rem] border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                                  {message}
                                </div>
                              ) : null}

                              <div className="grid gap-3 sm:grid-cols-3">
                                {activeRole.points.map((point) => (
                                  <div key={point} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-6 text-slate-300">
                                    {point}
                                  </div>
                                ))}
                              </div>

                              <button
                                type="button"
                                onClick={handleResetSelection}
                                className="block w-full text-center text-sm text-slate-500 transition hover:text-slate-200"
                              >
                                Switch Path
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </motion.div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </LayoutGroup>
          <div className="mt-6 pt-4 border-t border-slate-800/60 text-center">
            <p className="text-xs text-slate-500 font-medium">
              Hiring for a company?{' '}
              <a
                href="/auth/organization"
                className="text-cyan-500 hover:text-cyan-400 font-bold tracking-wide transition-colors cursor-pointer"
              >
                Access Corporate Console →
              </a>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}





