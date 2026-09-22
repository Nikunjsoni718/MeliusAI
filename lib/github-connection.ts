import crypto from 'node:crypto';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { GITHUB_ERROR_CODES, type GitHubErrorCode } from '@/lib/github-error-codes';

const ENCRYPTION_KEY_ENV = 'GITHUB_CONNECTION_ENCRYPTION_KEY';
const CIPHER_VERSION = 'v1';
const CIPHER_ALGORITHM = 'aes-256-gcm';
const CIPHER_AAD_PREFIX = 'meliusai:github-connection:';
const GITHUB_OAUTH_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_ACCESS_TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1000;
const GITHUB_APP_ACCESS_TOKEN_DEFAULT_TTL_SECONDS = 8 * 60 * 60;
const GITHUB_APP_REFRESH_TOKEN_DEFAULT_TTL_SECONDS = 180 * 24 * 60 * 60;

type GitHubConnectionRecord = {
  token_ciphertext: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  refresh_token_expires_at: string | null;
};

export type GitHubConnectionTokens = {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds?: number | null;
  refreshTokenExpiresInSeconds?: number | null;
};

const refreshesInFlight = new Map<string, Promise<string>>();

export class GitHubConnectionStorageError extends Error {
  constructor(message: string, options?: ErrorOptions, readonly code?: GitHubErrorCode) {
    super(message, options);
    this.name = 'GitHubConnectionStorageError';
  }
}

function decodeEncryptionKey(value: string) {
  const normalized = value.trim();
  const key = /^[0-9a-f]{64}$/i.test(normalized)
    ? Buffer.from(normalized, 'hex')
    : Buffer.from(normalized, 'base64');

  if (key.length !== 32) {
    throw new GitHubConnectionStorageError(
      `${ENCRYPTION_KEY_ENV} must be a base64-encoded or hexadecimal 32-byte key.`
    );
  }

  return key;
}

function getEncryptionKey() {
  const configuredKey = process.env[ENCRYPTION_KEY_ENV];
  if (!configuredKey?.trim()) {
    throw new GitHubConnectionStorageError(`${ENCRYPTION_KEY_ENV} is not configured.`);
  }

  return decodeEncryptionKey(configuredKey);
}

function getAdditionalAuthenticatedData(userId: string) {
  return Buffer.from(`${CIPHER_AAD_PREFIX}${userId}`, 'utf8');
}

function encodeSegment(value: Buffer) {
  return value.toString('base64url');
}

function decodeSegment(value: string) {
  try {
    return Buffer.from(value, 'base64url');
  } catch (error) {
    throw new GitHubConnectionStorageError('Stored GitHub connection ciphertext is invalid.', {
      cause: error,
    }, GITHUB_ERROR_CODES.CONNECTION_UNREADABLE);
  }
}

export function encryptGitHubConnectionToken(userId: string, token: string) {
  if (!userId || !token.trim()) {
    throw new GitHubConnectionStorageError('A user ID and GitHub access token are required.');
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(CIPHER_ALGORITHM, getEncryptionKey(), iv);
  cipher.setAAD(getAdditionalAuthenticatedData(userId));
  const encrypted = Buffer.concat([cipher.update(token.trim(), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [CIPHER_VERSION, encodeSegment(iv), encodeSegment(tag), encodeSegment(encrypted)].join('.');
}

export function decryptGitHubConnectionToken(userId: string, ciphertext: string) {
  const [version, encodedIv, encodedTag, encodedCiphertext, ...unexpectedSegments] = ciphertext.split('.');
  if (
    version !== CIPHER_VERSION ||
    !encodedIv ||
    !encodedTag ||
    !encodedCiphertext ||
    unexpectedSegments.length > 0
  ) {
    throw new GitHubConnectionStorageError(
      'Stored GitHub connection ciphertext is invalid.',
      undefined,
      GITHUB_ERROR_CODES.CONNECTION_UNREADABLE
    );
  }

  try {
    const decipher = crypto.createDecipheriv(
      CIPHER_ALGORITHM,
      getEncryptionKey(),
      decodeSegment(encodedIv)
    );
    decipher.setAAD(getAdditionalAuthenticatedData(userId));
    decipher.setAuthTag(decodeSegment(encodedTag));
    const token = Buffer.concat([
      decipher.update(decodeSegment(encodedCiphertext)),
      decipher.final(),
    ]).toString('utf8');

    if (!token.trim()) {
      throw new GitHubConnectionStorageError(
        'Stored GitHub connection token is empty.',
        undefined,
        GITHUB_ERROR_CODES.CONNECTION_UNREADABLE
      );
    }

    return token;
  } catch (error) {
    if (error instanceof GitHubConnectionStorageError) {
      throw error;
    }
    throw new GitHubConnectionStorageError('Stored GitHub connection could not be decrypted.', {
      cause: error,
    }, GITHUB_ERROR_CODES.CONNECTION_UNREADABLE);
  }
}

function getAccessTokenTtlSeconds() {
  const configuredTtl = Number(process.env.GITHUB_APP_USER_TOKEN_TTL_SECONDS);
  return Number.isFinite(configuredTtl) && configuredTtl > 0
    ? configuredTtl
    : GITHUB_APP_ACCESS_TOKEN_DEFAULT_TTL_SECONDS;
}

function normalizeExpiresInSeconds(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : getAccessTokenTtlSeconds();
}

function normalizeRefreshTokenExpiresInSeconds(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : GITHUB_APP_REFRESH_TOKEN_DEFAULT_TTL_SECONDS;
}

export function calculateGitHubTokenExpiresAt(expiresInSeconds?: number | null) {
  return new Date(Date.now() + normalizeExpiresInSeconds(expiresInSeconds) * 1000).toISOString();
}

export function calculateGitHubRefreshTokenExpiresAt(expiresInSeconds?: number | null) {
  return new Date(
    Date.now() + normalizeRefreshTokenExpiresInSeconds(expiresInSeconds) * 1000
  ).toISOString();
}

function needsGitHubAccessTokenRefresh(expiresAt: string | null) {
  if (!expiresAt) {
    // Legacy connections predate expiring GitHub App tokens. Keep using their
    // access token; they must be reconnected once if they are later rejected.
    return false;
  }

  const expiryMs = Date.parse(expiresAt);
  return !Number.isFinite(expiryMs) || expiryMs <= Date.now() + GITHUB_ACCESS_TOKEN_REFRESH_WINDOW_MS;
}

function getGitHubOAuthClientCredentials() {
  const clientId = process.env.GITHUB_CLIENT_ID?.trim();
  const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new GitHubConnectionStorageError(
      'GitHub App OAuth refresh is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.'
    );
  }

  return { clientId, clientSecret };
}

function assertGitHubConnectionTokens(tokens: GitHubConnectionTokens) {
  if (!tokens.accessToken?.trim() || !tokens.refreshToken?.trim()) {
    throw new GitHubConnectionStorageError(
      'GitHub OAuth did not return both an access token and refresh token. Reconnect GitHub.',
      undefined,
      GITHUB_ERROR_CODES.CONNECTION_UNREADABLE
    );
  }
}

export async function upsertGitHubConnection(userId: string, tokens: GitHubConnectionTokens) {
  assertGitHubConnectionTokens(tokens);
  const token_ciphertext = encryptGitHubConnectionToken(userId, tokens.accessToken);
  const refresh_token = encryptGitHubConnectionToken(userId, tokens.refreshToken);
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('github_connections').upsert(
    {
      user_id: userId,
      token_ciphertext,
      refresh_token,
      token_expires_at: calculateGitHubTokenExpiresAt(tokens.expiresInSeconds),
      refresh_token_expires_at: calculateGitHubRefreshTokenExpiresAt(tokens.refreshTokenExpiresInSeconds),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    throw new GitHubConnectionStorageError('Unable to save the GitHub connection.', {
      cause: error,
    });
  }
}

async function readGitHubConnection(userId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('github_connections')
    .select('token_ciphertext, refresh_token, token_expires_at, refresh_token_expires_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw new GitHubConnectionStorageError('Unable to read the GitHub connection.', {
      cause: error,
    });
  }

  return data as GitHubConnectionRecord | null;
}

function decryptAccessToken(userId: string, record: GitHubConnectionRecord) {
  return decryptGitHubConnectionToken(userId, record.token_ciphertext);
}

function decryptRefreshToken(userId: string, record: GitHubConnectionRecord) {
  if (!record.refresh_token?.trim()) {
    throw new GitHubConnectionStorageError(
      'Your stored GitHub connection needs to be reconnected.',
      undefined,
      GITHUB_ERROR_CODES.CONNECTION_UNREADABLE
    );
  }

  return decryptGitHubConnectionToken(userId, record.refresh_token);
}

async function requestGitHubAccessTokenRefresh(refreshToken: string) {
  const { clientId, clientSecret } = getGitHubOAuthClientCredentials();
  let response: Response;
  try {
    response = await fetch(GITHUB_OAUTH_TOKEN_URL, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });
  } catch (error) {
    throw new GitHubConnectionStorageError('Unable to refresh the GitHub connection.', { cause: error });
  }

  if (!response.ok) {
    throw new GitHubConnectionStorageError(
      'Your GitHub connection has expired or been revoked. Reconnect GitHub and try again.',
      undefined,
      GITHUB_ERROR_CODES.CONNECTION_UNREADABLE
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new GitHubConnectionStorageError('GitHub returned an invalid token refresh response.', { cause: error });
  }

  const responseTokens = payload as {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
    refresh_token_expires_in?: unknown;
  };
  const accessToken = typeof responseTokens.access_token === 'string'
    ? responseTokens.access_token.trim()
    : '';
  const nextRefreshToken = typeof responseTokens.refresh_token === 'string'
    ? responseTokens.refresh_token.trim()
    : '';
  const expiresInSeconds = typeof responseTokens.expires_in === 'number'
    ? responseTokens.expires_in
    : Number(responseTokens.expires_in);
  const refreshTokenExpiresInSeconds = typeof responseTokens.refresh_token_expires_in === 'number'
    ? responseTokens.refresh_token_expires_in
    : Number(responseTokens.refresh_token_expires_in);

  if (!accessToken || !nextRefreshToken || !Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
    throw new GitHubConnectionStorageError(
      'GitHub returned an incomplete token refresh response.',
      undefined,
      GITHUB_ERROR_CODES.CONNECTION_UNREADABLE
    );
  }

  return {
    accessToken,
    refreshToken: nextRefreshToken,
    expiresInSeconds,
    refreshTokenExpiresInSeconds: Number.isFinite(refreshTokenExpiresInSeconds) && refreshTokenExpiresInSeconds > 0
      ? refreshTokenExpiresInSeconds
      : undefined,
  };
}

async function refreshGitHubConnectionTokenFromRecord(userId: string, record: GitHubConnectionRecord) {
  const encryptedRefreshToken = record.refresh_token;
  if (!encryptedRefreshToken?.trim()) {
    throw new GitHubConnectionStorageError(
      'Your stored GitHub connection needs to be reconnected.',
      undefined,
      GITHUB_ERROR_CODES.CONNECTION_UNREADABLE
    );
  }
  const refreshToken = decryptRefreshToken(userId, record);
  const nextTokens = await requestGitHubAccessTokenRefresh(refreshToken);
  const admin = createSupabaseAdminClient();
  const token_ciphertext = encryptGitHubConnectionToken(userId, nextTokens.accessToken);
  const refresh_token = encryptGitHubConnectionToken(userId, nextTokens.refreshToken);
  const { data, error } = await admin
    .from('github_connections')
    .update({
      token_ciphertext,
      refresh_token,
      token_expires_at: calculateGitHubTokenExpiresAt(nextTokens.expiresInSeconds),
      refresh_token_expires_at: calculateGitHubRefreshTokenExpiresAt(
        nextTokens.refreshTokenExpiresInSeconds
      ),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('token_ciphertext', record.token_ciphertext)
    .eq('refresh_token', encryptedRefreshToken)
    .select('token_ciphertext')
    .maybeSingle();

  if (error) {
    throw new GitHubConnectionStorageError('Unable to save the refreshed GitHub connection.', {
      cause: error,
    });
  }

  if (data?.token_ciphertext) {
    return decryptGitHubConnectionToken(userId, data.token_ciphertext);
  }

  // Another request refreshed the same rotating refresh token first. Use its
  // persisted replacement instead of treating the connection as invalid.
  const latestRecord = await readGitHubConnection(userId);
  if (latestRecord?.token_ciphertext && !needsGitHubAccessTokenRefresh(latestRecord.token_expires_at)) {
    return decryptAccessToken(userId, latestRecord);
  }

  throw new GitHubConnectionStorageError('GitHub connection refresh did not persist. Please try again.');
}

async function refreshGitHubConnectionToken(userId: string, forceRefresh: boolean) {
  const existingRefresh = refreshesInFlight.get(userId);
  if (existingRefresh) {
    return existingRefresh;
  }

  const refreshPromise = (async () => {
    // Re-read after acquiring the process-local lock so a request which waited
    // behind another refresh always consumes the newest rotating token.
    const record = await readGitHubConnection(userId);
    if (!record?.token_ciphertext) {
      throw new GitHubConnectionStorageError(
        'Your GitHub connection is missing. Reconnect GitHub and try again.',
        undefined,
        GITHUB_ERROR_CODES.AUTH_REQUIRED
      );
    }

    if (!forceRefresh && !needsGitHubAccessTokenRefresh(record.token_expires_at)) {
      return decryptAccessToken(userId, record);
    }

    return refreshGitHubConnectionTokenFromRecord(userId, record);
  })();

  refreshesInFlight.set(userId, refreshPromise);
  try {
    return await refreshPromise;
  } finally {
    if (refreshesInFlight.get(userId) === refreshPromise) {
      refreshesInFlight.delete(userId);
    }
  }
}

async function resolveGitHubConnectionToken(userId: string, forceRefresh = false) {
  const record = await readGitHubConnection(userId);
  if (!record?.token_ciphertext) {
    return null;
  }

  if (forceRefresh || needsGitHubAccessTokenRefresh(record.token_expires_at)) {
    return refreshGitHubConnectionToken(userId, forceRefresh);
  }

  return decryptAccessToken(userId, record);
}

/** Resolves a valid token and silently refreshes it five minutes before expiry. */
export async function getGitHubConnectionToken(userId: string) {
  return resolveGitHubConnectionToken(userId);
}

/** Refresh after an unexpected GitHub 401, then retry that one GitHub request. */
export async function refreshGitHubConnectionAccessToken(userId: string) {
  const accessToken = await resolveGitHubConnectionToken(userId, true);
  if (!accessToken) {
    throw new GitHubConnectionStorageError(
      'Your GitHub connection is missing. Reconnect GitHub and try again.',
      undefined,
      GITHUB_ERROR_CODES.AUTH_REQUIRED
    );
  }
  return accessToken;
}

export async function fetchWithGitHubConnectionToken(
  userId: string,
  request: (accessToken: string) => Promise<Response>
) {
  const accessToken = await getGitHubConnectionToken(userId);
  if (!accessToken) {
    throw new GitHubConnectionStorageError(
      'Your GitHub connection is missing. Reconnect GitHub and try again.',
      undefined,
      GITHUB_ERROR_CODES.AUTH_REQUIRED
    );
  }

  const initialResponse = await request(accessToken);
  if (initialResponse.status !== 401) {
    return initialResponse;
  }

  const refreshedAccessToken = await refreshGitHubConnectionAccessToken(userId);
  return request(refreshedAccessToken);
}

export async function deleteGitHubConnection(userId: string) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('github_connections').delete().eq('user_id', userId);
  if (error) {
    throw new GitHubConnectionStorageError('Unable to remove the GitHub connection.', {
      cause: error,
    });
  }
}
