// Run with Node and @electric-sql/pglite installed (or PGLITE_MODULE_PATH set).
// Uses PostgreSQL compiled to WASM, with a disposable database; no remote writes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(modulePath).href : '@electric-sql/pglite');
const db = new PGlite();
const migration = await readFile(new URL('../supabase/migrations/202609050001_workspace_cumulative_diffs.sql', import.meta.url), 'utf8');
const user = '00000000-0000-0000-0000-000000000001';
const stranger = '00000000-0000-0000-0000-000000000002';
const workspace = '00000000-0000-0000-0000-000000000003';
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
    create table public.project_folders(id uuid primary key, user_id uuid references profiles(id), evaluation_score integer,
      score_delta integer, delta_summary text, executive_summary text, pros text[], cons text[], recommendations text[], has_been_audited boolean);
    grant select on public.project_folders to authenticated;
    insert into profiles values ('${user}'), ('${stranger}');
    insert into project_folders(id, user_id) values('${workspace}', '${user}');
  `);
  await db.exec(migration);
  await db.exec('set role service_role');
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
  const report = { score: 80, score_delta: 5, delta_summary: 'Authorization improved.', executive_summary: 'Safer authorization.',
    pros: ['Authorization: Owner check added.'], cons: [], recommendations: [] };
  await mustFail(() => rpc('finalize_verified_audit', [diff.id, stranger, 0, report]), /WORKSPACE_NOT_FOUND/);

  // Failure of the UI projection rolls back every verification write.
  await db.exec('reset role; alter table project_folders add constraint simulated_projection_failure check(evaluation_score < 80); set role service_role;');
  await mustFail(() => rpc('finalize_verified_audit', [diff.id, user, 0, report]), /simulated_projection_failure/);
  check((await db.query('select status from workspace_diffs where id=$1', [diff.id])).rows[0].status, 'pending');
  check((await db.query('select baseline_version from workspace_repository_states')).rows[0].baseline_version, 0);
  await db.exec('reset role; alter table project_folders drop constraint simulated_projection_failure; set role service_role;');
  check(await rpc('finalize_verified_audit', [diff.id, user, 0, report]), report);
  check(await rpc('finalize_verified_audit', [diff.id, user, 0, { ...report, score: 12 }]), report);
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
  await rpc('finalize_verified_audit', [next.id, user, 1, { ...report, score_delta: 0 }]);
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
