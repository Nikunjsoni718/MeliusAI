// Run with Node and @electric-sql/pglite installed (or PGLITE_MODULE_PATH set).
// Uses PostgreSQL compiled to WASM, with a disposable database; no remote writes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(modulePath).href : '@electric-sql/pglite');
const db = new PGlite();
const baselineMigration = await readFile(new URL('../supabase/migrations/202609050001_workspace_cumulative_diffs.sql', import.meta.url), 'utf8');
const lifecycleMigration = await readFile(new URL('../supabase/migrations/202609170001_project_lifecycle_notifications.sql', import.meta.url), 'utf8');
const severityMigration = await readFile(new URL('../supabase/migrations/202609180001_audit_severity_refactor.sql', import.meta.url), 'utf8');
const deletionCleanupMigration = await readFile(new URL('../supabase/migrations/202609200001_project_deletion_cleanup.sql', import.meta.url), 'utf8');
const user = '00000000-0000-0000-0000-000000000001';
const stranger = '00000000-0000-0000-0000-000000000002';
const workspace = '00000000-0000-0000-0000-000000000003';
const deletedProject = '00000000-0000-0000-0000-000000000004';
const deletedSnapshot = '00000000-0000-0000-0000-000000000005';
const deletedFinding = '00000000-0000-0000-0000-000000000006';
const deletedDirective = '00000000-0000-0000-0000-000000000007';
const deletedFileRecord = '00000000-0000-0000-0000-000000000008';
const deletedFolder = '00000000-0000-0000-0000-000000000009';
const deletedFolderProject = '00000000-0000-0000-0000-000000000010';
const deletedFolderFinding = '00000000-0000-0000-0000-000000000011';
const deletedFolderDirective = '00000000-0000-0000-0000-000000000012';
const deletedFolderFileRecord = '00000000-0000-0000-0000-000000000013';
const base = 'a'.repeat(40), head = 'b'.repeat(40), newerHead = 'c'.repeat(40);
let checks = 0;
const check = (value, expected) => { assert.deepEqual(value, expected); checks++; };
const rpc = async (name, args) => (await db.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as value`, args)).rows[0].value;
const mustFail = async (fn, pattern) => { await assert.rejects(fn, pattern); checks++; };
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    create table public.profiles(id uuid primary key);
    create table public.projects(id uuid primary key, user_id uuid references profiles(id), folder_id uuid, name text, title text, file_name text,
      storage_path text, score integer, evaluation_score integer, logic_score integer);
    create table public.project_folders(id uuid primary key, user_id uuid references profiles(id), name text, source text, score integer, evaluation_score integer,
      score_delta integer, delta_summary text, executive_summary text, pros text[], cons text[], recommendations text[], audit_findings jsonb, has_been_audited boolean);
    create table public.audit_snapshots(id uuid primary key, workspace_id uuid, commit_sha text, score integer, score_delta integer not null default 0, delta_summary text);
    create table public.notifications(id uuid primary key default gen_random_uuid(), user_id uuid, project_id text, type text, title text, message text, action_url text, metadata jsonb);
    create table public.findings(id uuid primary key, project_id uuid, workspace_id uuid, audit_snapshot_id uuid);
    create table public.directives(id uuid primary key, finding_id uuid);
    create table public.file_records(id uuid primary key, project_id uuid, workspace_id uuid, storage_path text);
    grant select on public.project_folders to authenticated;
    insert into profiles values ('${user}'), ('${stranger}');
    insert into project_folders(id, user_id) values('${workspace}', '${user}');
  `);
  await db.exec(baselineMigration);
  await db.exec(lifecycleMigration);
  await db.exec(severityMigration);
  await db.exec(deletionCleanupMigration);
  const snapshotColumns = await db.query(`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'audit_snapshots'
    order by column_name
  `);
  check(
    ['id', 'workspace_id', 'project_id', 'score', 'score_delta', 'report', 'created_at', 'updated_at']
      .every((column) => snapshotColumns.rows.some((row) => row.column_name === column)),
    true,
  );
  await db.exec('set role service_role');
  await db.query(
    'insert into projects(id, user_id, name, title, file_name, storage_path) values($1, $2, $3, $4, $5, $6)',
    [deletedProject, user, 'deleted.ts', 'deleted.ts', 'deleted.ts', `${user}/deleted.ts`],
  );
  await db.query(
    'insert into audit_snapshots(id, workspace_id, project_id, commit_sha, score, report) values($1, $2, $3, $4, $5, $6)',
    [deletedSnapshot, deletedProject, deletedProject, base, 80, {}],
  );
  await db.query('insert into findings(id, project_id, audit_snapshot_id) values($1, $2, $3)', [deletedFinding, deletedProject, deletedSnapshot]);
  await db.query('insert into directives(id, finding_id) values($1, $2)', [deletedDirective, deletedFinding]);
  await db.query('insert into file_records(id, project_id, storage_path) values($1, $2, $3)', [deletedFileRecord, deletedProject, `${user}/deleted-record.ts`]);
  const deletionManifest = await rpc('get_project_deletion_storage_manifest', [user, deletedProject]);
  check(deletionManifest.storage_paths.sort(), [`${user}/deleted-record.ts`, `${user}/deleted.ts`].sort());
  await rpc('delete_project_with_notification', [user, deletedProject]);
  check((await db.query('select count(*)::int as n from projects where id=$1', [deletedProject])).rows[0].n, 0);
  check((await db.query('select count(*)::int as n from audit_snapshots where workspace_id=$1 or project_id=$1', [deletedProject])).rows[0].n, 0);
  check((await db.query('select count(*)::int as n from findings where project_id=$1', [deletedProject])).rows[0].n, 0);
  check((await db.query('select count(*)::int as n from directives where id=$1', [deletedDirective])).rows[0].n, 0);
  check((await db.query('select count(*)::int as n from file_records where project_id=$1', [deletedProject])).rows[0].n, 0);
  await db.query('insert into project_folders(id, user_id, name, source) values($1, $2, $3, $4)', [deletedFolder, user, 'same-repository-name', 'github']);
  await db.query(
    'insert into projects(id, user_id, folder_id, name, title, file_name, storage_path) values($1, $2, $3, $4, $5, $6, $7)',
    [deletedFolderProject, user, deletedFolder, 'workspace.ts', 'workspace.ts', 'workspace.ts', `${user}/${deletedFolder}/workspace.ts`],
  );
  await db.query('insert into findings(id, workspace_id) values($1, $2)', [deletedFolderFinding, deletedFolder]);
  await db.query('insert into directives(id, finding_id) values($1, $2)', [deletedFolderDirective, deletedFolderFinding]);
  await db.query('insert into file_records(id, workspace_id, storage_path) values($1, $2, $3)', [deletedFolderFileRecord, deletedFolder, `${user}/${deletedFolder}/record.ts`]);
  const folderDeletionManifest = await rpc('get_project_folder_deletion_storage_manifest', [user, deletedFolder]);
  check(folderDeletionManifest.storage_paths.sort(), [`${user}/${deletedFolder}/record.ts`, `${user}/${deletedFolder}/workspace.ts`].sort());
  await rpc('delete_project_folder_with_notification', [user, deletedFolder]);
  check((await db.query('select count(*)::int as n from project_folders where id=$1', [deletedFolder])).rows[0].n, 0);
  check((await db.query('select count(*)::int as n from projects where id=$1', [deletedFolderProject])).rows[0].n, 0);
  check((await db.query('select count(*)::int as n from findings where workspace_id=$1', [deletedFolder])).rows[0].n, 0);
  check((await db.query('select count(*)::int as n from directives where id=$1', [deletedFolderDirective])).rows[0].n, 0);
  check((await db.query('select count(*)::int as n from file_records where workspace_id=$1', [deletedFolder])).rows[0].n, 0);
  let state = await rpc('initialize_repository_baseline', [workspace, user, 'owner/repo', 'main', base]);
  check(state.baseline_version, 0);
  check(state.previous_verified_report, null);
  const same = await rpc('initialize_repository_baseline', [workspace, user, 'owner/repo', 'main', head]);
  check(same.last_verified_commit_sha, base);
  await mustFail(() => rpc('initialize_repository_baseline', [workspace, stranger, 'owner/repo', 'main', base]), /WORKSPACE_NOT_FOUND/);
  await mustFail(() => rpc('initialize_repository_baseline', [workspace, user, 'owner/repo', 'other', base]), /REPOSITORY_BINDING_CONFLICT/);
  const delta = { total_insertions: 1, total_deletions: 1, files: [
    { filename: 'auth.py', insertions: 1, deletions: 1, patch: '@@ -1 +1 @@\n-old\n+new', status: 'modified' }
  ] };
  const save = (sha = head, payload = delta, version = 0, baseline = base) => rpc('save_workspace_diff', [state.id, user, version, baseline, sha, payload, 'incremental']);
  await mustFail(() => save(head, { ...delta, total_insertions: 10 }), /INVALID_DIFF/);
  const diff = await save();
  check((await save()).id, diff.id);
  const competing = await save(newerHead);
  const report = { score: 80, delta_summary: 'Authorization controls are now isolated from presentation code.', executive_summary: 'Safer authorization boundaries are verified.',
    pros: ['Authorization: Owner check added.'], cons: ['Session Gap: Rotation is not verified.'], recommendations: ['Rotate Session: Enforce expiration checks.'],
    finding_impacts: { pros: [{ text: 'Authorization: Owner check added.' }], cons: [{ findingId: 'F1', text: 'Session Gap: Rotation is not verified.', severity: 'WARNING', isCatastrophic: false }], recommendations: [{ findingId: 'F1', text: 'Rotate Session: Enforce expiration checks.', impactArea: 'security' }] } };
  await mustFail(() => rpc('finalize_verified_audit', [diff.id, stranger, 0, report]), /WORKSPACE_NOT_FOUND/);
  await mustFail(() => rpc('finalize_verified_audit', [diff.id, user, 0, { ...report, score: 12 }]), /INVALID_DIFF/);
  await mustFail(() => rpc('finalize_verified_audit', [diff.id, user, 0, { ...report, score: 99 }]), /INVALID_DIFF/);

  // Failure of the UI projection rolls back every verification write.
  await db.exec('reset role; alter table project_folders add constraint simulated_projection_failure check(evaluation_score < 80); set role service_role;');
  await mustFail(() => rpc('finalize_verified_audit', [diff.id, user, 0, report]), /simulated_projection_failure/);
  check((await db.query('select status from workspace_diffs where id=$1', [diff.id])).rows[0].status, 'pending');
  check((await db.query('select baseline_version from workspace_repository_states')).rows[0].baseline_version, 0);
  await db.exec('reset role; alter table project_folders drop constraint simulated_projection_failure; set role service_role;');
  check(await rpc('finalize_verified_audit', [diff.id, user, 0, report]), report);
  check(await rpc('finalize_verified_audit', [diff.id, user, 0, report]), report);
  await mustFail(() => rpc('finalize_verified_audit', [competing.id, user, 0, report]), /VERIFY_CONFLICT/);
  state = (await db.query('select * from workspace_repository_states')).rows[0];
  check(state.last_verified_commit_sha, head);
  check(state.baseline_version, 1);
  check(state.previous_verified_report, report);
  await rpc('mark_workspace_diff_failed', [diff.id, user, 'LATE_FAILURE']);
  check((await db.query('select status from workspace_diffs where id=$1', [diff.id])).rows[0].status, 'verified');
  await mustFail(() => db.query('update workspace_diffs set files=$1 where id=$2', [[], diff.id]), /IMMUTABLE_DIFF/);
  await mustFail(() => save(newerHead), /VERIFY_CONFLICT/);

  // The next window begins at the head captured by the winning verification.
  const next = await save(newerHead, { total_insertions: 0, total_deletions: 0, files: [] }, 1, head);
  check(next.base_sha, head);
  await rpc('finalize_verified_audit', [next.id, user, 1, report]);
  await mustFail(() => rpc('finalize_verified_audit', [diff.id, user, 0, report]), /VERIFY_CONFLICT/);

  await db.exec('reset role; set role authenticated;');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
  check((await db.query('select count(*)::int as n from workspace_repository_states')).rows[0].n, 1);
  await mustFail(() => rpc('finalize_verified_audit', [next.id, user, 1, report]), /permission denied/);
  await mustFail(() => db.query('update workspace_repository_states set baseline_version=0'), /permission denied/);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [stranger]);
  check((await db.query('select count(*)::int as n from workspace_repository_states')).rows[0].n, 0);
  check((await db.query('select count(*)::int as n from workspace_diffs')).rows[0].n, 0);
  await db.exec('reset role; set role anon;');
  await mustFail(() => db.query('select * from workspace_diffs'), /permission denied/);
  console.log(`PostgreSQL migration/RPC checks passed: ${checks}`);
} finally {
  await db.close();
}
