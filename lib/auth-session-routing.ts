export const AUTH_LOGIN_STATUS_KEY = 'loginStatus';
export const AUTH_USER_ROLE_KEY = 'userRole';
export const AUTH_USER_DESTINATION_KEY = 'userDestination';

export type PersistedUserRole = 'individual' | 'organization';

export type AuthRouteUser = {
  id: string;
  raw_user_meta_data?: {
    role?: string;
    username?: string;
    org_username?: string;
  };
  user_metadata?: {
    role?: string;
    username?: string;
    org_username?: string;
  };
};

export function normalizePersistedRole(role?: string | null): PersistedUserRole {
  const normalizedRole = role?.toLowerCase();

  if (
    normalizedRole === 'corporate' ||
    normalizedRole === 'organization' ||
    normalizedRole === 'organisation' ||
    normalizedRole === 'recruiter'
  ) {
    return 'organization';
  }

  return 'individual';
}

export function getUserMetadataRole(user: AuthRouteUser | null | undefined) {
  return user?.raw_user_meta_data?.role ?? user?.user_metadata?.role ?? null;
}

export function getProfileHandle(user: AuthRouteUser) {
  return user.raw_user_meta_data?.username || user.user_metadata?.username || user.id;
}

export function getAuthenticatedDestination(user: AuthRouteUser) {
  const role = normalizePersistedRole(getUserMetadataRole(user));

  if (role === 'organization') {
    return '/organization/dashboard';
  }

  return `/profile/${encodeURIComponent(getProfileHandle(user))}`;
}

export function persistAuthenticatedRouteState(role: PersistedUserRole) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(AUTH_LOGIN_STATUS_KEY, 'loggedIn');
  window.localStorage.setItem(AUTH_USER_ROLE_KEY, role);
}

export function persistAuthenticatedUser(user: AuthRouteUser) {
  const role = normalizePersistedRole(getUserMetadataRole(user));

  persistAuthenticatedRouteState(role);

  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(AUTH_USER_DESTINATION_KEY, getAuthenticatedDestination(user));
}

export function clearPersistedAuthState() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(AUTH_LOGIN_STATUS_KEY);
  window.localStorage.removeItem(AUTH_USER_ROLE_KEY);
  window.localStorage.removeItem(AUTH_USER_DESTINATION_KEY);
}

export function readPersistedAuthState() {
  if (typeof window === 'undefined') {
    return { loginStatus: null, userRole: null } as const;
  }

  const loginStatus = window.localStorage.getItem(AUTH_LOGIN_STATUS_KEY);
  const userRole = window.localStorage.getItem(AUTH_USER_ROLE_KEY);
  const userDestination = window.localStorage.getItem(AUTH_USER_DESTINATION_KEY);

  return {
    loginStatus: loginStatus === 'loggedIn' ? loginStatus : null,
    userRole: userRole === 'individual' || userRole === 'organization' ? userRole : null,
    userDestination: userDestination?.startsWith('/') ? userDestination : null,
  } as const;
}

export function getPersistedDestination(role: PersistedUserRole | null, storedDestination?: string | null) {
  if (role === 'organization') {
    return '/organization/dashboard';
  }

  if (role === 'individual' && storedDestination?.startsWith('/profile/')) {
    return storedDestination;
  }

  return null;
}
