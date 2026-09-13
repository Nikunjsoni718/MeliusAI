import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const VAULT_BUCKET = 'vault';
const STORAGE_REMOVE_BATCH_SIZE = 100;

type StorageListEntry = {
  id?: string | null;
  name: string;
};

export type VaultDeletionCounts = {
  projects: number;
  folders: number;
  pendingImports: number;
  storageObjects: number;
};

function vaultPrefix(userId: string) {
  return `${userId}/`;
}

async function listVaultObjects(prefix: string): Promise<string[]> {
  const admin = createSupabaseAdminClient();
  const paths: string[] = [];
  let offset = 0;

  do {
    const { data, error } = await admin.storage.from(VAULT_BUCKET).list(prefix, {
      limit: 1000,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });

    if (error) {
      throw new Error('Unable to list Vault storage objects.');
    }

    const entries = (data ?? []) as StorageListEntry[];
    for (const entry of entries) {
      const childPath = `${prefix}${entry.name}`;
      if (entry.id) {
        paths.push(childPath);
      } else {
        paths.push(...(await listVaultObjects(`${childPath}/`)));
      }
    }

    if (entries.length < 1000) {
      break;
    }
    offset += entries.length;
  } while (true);

  return paths;
}

async function deleteByUserId(table: 'projects' | 'project_folders' | 'pending_imports', userId: string) {
  const admin = createSupabaseAdminClient();
  const { count, error: countError } = await admin
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (countError) {
    throw new Error(`Unable to count ${table} before deletion.`);
  }

  const { error } = await admin.from(table).delete().eq('user_id', userId);
  if (error) {
    throw new Error(`Unable to delete ${table}.`);
  }

  return count ?? 0;
}

export async function eraseUserVaultData(userId: string): Promise<VaultDeletionCounts> {
  const prefix = vaultPrefix(userId);
  const storagePaths = await listVaultObjects(prefix);
  const admin = createSupabaseAdminClient();

  for (let index = 0; index < storagePaths.length; index += STORAGE_REMOVE_BATCH_SIZE) {
    const { error } = await admin.storage
      .from(VAULT_BUCKET)
      .remove(storagePaths.slice(index, index + STORAGE_REMOVE_BATCH_SIZE));
    if (error) {
      throw new Error('Unable to remove Vault storage objects.');
    }
  }

  const projects = await deleteByUserId('projects', userId);
  const folders = await deleteByUserId('project_folders', userId);
  const pendingImports = await deleteByUserId('pending_imports', userId);

  return { projects, folders, pendingImports, storageObjects: storagePaths.length };
}
