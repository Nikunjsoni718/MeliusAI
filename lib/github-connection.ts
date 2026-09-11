import crypto from 'node:crypto';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const ENCRYPTION_KEY_ENV = 'GITHUB_CONNECTION_ENCRYPTION_KEY';
const CIPHER_VERSION = 'v1';
const CIPHER_ALGORITHM = 'aes-256-gcm';
const CIPHER_AAD_PREFIX = 'meliusai:github-connection:';

type GitHubConnectionRecord = {
  token_ciphertext: string;
};

export class GitHubConnectionStorageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
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
    });
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
    throw new GitHubConnectionStorageError('Stored GitHub connection ciphertext is invalid.');
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
      throw new GitHubConnectionStorageError('Stored GitHub connection token is empty.');
    }

    return token;
  } catch (error) {
    if (error instanceof GitHubConnectionStorageError) {
      throw error;
    }
    throw new GitHubConnectionStorageError('Stored GitHub connection could not be decrypted.', {
      cause: error,
    });
  }
}

export async function upsertGitHubConnection(userId: string, providerToken: string) {
  const token_ciphertext = encryptGitHubConnectionToken(userId, providerToken);
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('github_connections').upsert(
    {
      user_id: userId,
      token_ciphertext,
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

export async function getGitHubConnectionToken(userId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('github_connections')
    .select('token_ciphertext')
    .eq('user_id', userId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw new GitHubConnectionStorageError('Unable to read the GitHub connection.', {
      cause: error,
    });
  }

  const record = data as GitHubConnectionRecord | null;
  return record?.token_ciphertext
    ? decryptGitHubConnectionToken(userId, record.token_ciphertext)
    : null;
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
