import { replayed } from "./replaylib";
const db = await replayed();
const cfg = await db.query(`select count(*) n from pg_proc where prosecdef and proconfig @> array['search_path=pg_catalog'] and proname ~ '^(rout_agent_|rout_parent_|rout_workspace_)'`); console.log("pinned", cfg.rows);
export const SMOKE = `
do $$ begin perform 1; end $$;
`;
const U = "00000000-0000-4000-8000-0000000000a1";
const K = "00000000-0000-4000-8000-0000000000a2";
const steps: [string, unknown[]][] = [
  ["insert into public.users (id, email) values ($1, 'owner@example.test'), ($2, 'kid@example.test')", [U, K]],
  ["select set_config('rout.current_user_id', '', true)", []],
  ["select * from public.rout_agent_sandbox_register('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'ip1', 'Agent One')", []],
  ["select * from public.rout_agent_sandbox_context('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')", []],
  ["select * from public.rout_agent_sandbox_provision('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'Agent Space', 'agent-space-x7', 'desc', 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd', '{}'::jsonb)", []],
  ["select * from public.rout_agent_sandbox_patch_draft('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '{\"bio\":\"hi\"}'::jsonb, '{\"theme\":\"x\"}'::jsonb)", []],
  ["select public.rout_agent_sandbox_set_apps('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '[]'::jsonb)", []],
  ["select * from public.rout_agent_sandbox_state('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')", []],
  ["select set_config('rout.current_user_id', $1, true)", [U]],
  ["select * from public.rout_agent_claim_preview('cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc')", []],
  ["select * from public.rout_claim_agent_workspace_v2('dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd')", []],
  ["select public.rout_is_workspace_member((select id from public.workspaces where slug like 'agent-space-x7%'))", []],
  ["select public.rout_workspace_role((select id from public.workspaces where slug like 'agent-space-x7%'))", []],
  ["select * from public.rout_workspace_team((select id from public.workspaces where slug like 'agent-space-x7%'))", []],
  ["select public.rout_agent_audit_log((select id from public.workspaces where slug like 'agent-space-x7%'), $1, 'client', 'update', 'profiles', 'p1', '{}'::jsonb, '{}'::jsonb)", [U]],
  ["select public.rout_agent_audit_mark_reverted((select id from public.agent_audit_logs limit 1))", []],
  ["select * from public.rout_agent_provision_workspace('client-a', 'Second', 'second-space-x7', '', 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee')", []],
  ["select * from public.rout_claim_agent_workspace('eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee')", []],
  ["select * from public.rout_agent_provision_workspace('client-a', 'Third', 'third-space-x7', '', 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')", []],
  ["select public.rout_agent_audit_revert_workspace((select id from public.workspaces where slug like 'third-space-x7%'))", []],
  ["select * from public.rout_agent_provision_workspace('client-a', 'Fourth', 'fourth-space-x7', '', '9999999999999999999999999999999999999999999999999999999999999999')", []],
  ["update public.agent_workspace_claims set created_at = created_at - interval '25 hours', expires_at = expires_at - interval '25 hours' where token_hash = '9999999999999999999999999999999999999999999999999999999999999999'", []],
  ["select public.rout_purge_unclaimed_agent_workspaces()", []],
  ["select public.rout_purge_expired_agent_sandboxes()", []],
  ["insert into public.workspace_invites (workspace_id, email, role, status, invited_by) select id, 'kid@example.test', 'editor', 'pending', $1 from public.workspaces where slug like 'agent-space-x7%'", [U]],
  ["select set_config('rout.current_user_id', $1, true)", [K]],
  ["select public.rout_accept_workspace_invites('kid@example.test')", []],
  ["select * from public.rout_transfer_by_token('nope')", []],
  ["select * from public.rout_transfers_for_email('kid@example.test')", []],
  ["select public.workspace_may_drop_suffix('free', (select id from public.workspaces where slug like 'agent-space-x7%'))", []],
  ["select * from public.rout_public_workspace((select slug from public.workspaces where slug like 'agent-space-x7%'))", []],
  ["select * from public.rout_public_workspace_relme((select slug from public.workspaces where slug like 'agent-space-x7%'))", []],
  ["select public.rout_workspace_atproto_did('agent-space-x7', 'example.test')", []],
  ["select public.rout_workspace_slug_for_domain('example.test')", []],
  ["select public.rout_workspace_slug_taken((select slug from public.workspaces where slug like 'agent-space-x7%'))", []],
  ["select public.workspace_slug_for_root_alias('agent')", []],
  ["select public.rout_migrated_workspace_for_handle('someone', 'alias')", []],
  ["select public.rout_migrated_workspace_for_handle('someone', 'profile')", []],
  ["select public.rout_record_signup_age('kid@example.test', (current_date - interval '10 years')::date, 'parent@example.test', '8888888888888888888888888888888888888888888888888888888888888888')", []],
  ["select * from public.rout_parent_lookup('8888888888888888888888888888888888888888888888888888888888888888')", []],
  ["select public.rout_parent_set_qa_level('8888888888888888888888888888888888888888888888888888888888888888', 'verified_only')", []],
  ["select public.rout_parent_approve_consent('8888888888888888888888888888888888888888888888888888888888888888')", []],
  ["select public.rout_user_is_minor($1)", [K]],
  ["select public.rout_parent_request_payment($1, '7777777777777777777777777777777777777777777777777777777777777777', '{\"item\":\"pro\"}'::jsonb)", [K]],
  ["select public.rout_parent_mark_payment('7777777777777777777777777777777777777777777777777777777777777777')", []],
];
await db.exec("begin");
for (const [sql, p] of steps) {
  try { const r = await db.query(sql, p); console.log("OK ", sql.slice(0, 90), JSON.stringify(r.rows).slice(0, 160)); }
  catch (e: any) { console.log("ERR", sql.slice(0, 90), e.code, e.message); await db.exec("rollback"); process.exit(1); }
}
await db.exec("rollback");
