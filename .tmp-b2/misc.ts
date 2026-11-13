import { replayed } from "./replaylib";
const db = await replayed();
const base = ['workspace_invites','workspace_members','agent_audit_logs','workspaces','agent_workspace_claims','agent_sandboxes','workspace_profile_drafts','parent_authorizations','users','oauth_clients','tracked_qrs','bookings','workspace_transfers','workspace_social_links','workspace_root_aliases','entitlement_overrides','profiles','alias_profiles'];
const f = await db.query(`select relname from pg_class where relforcerowsecurity and relnamespace='public'::regnamespace`); console.log("forced RLS:", f.rows);
const d = await db.query(`select c.relname, a.attname, pg_get_expr(ad.adbin, ad.adrelid) e from pg_attrdef ad join pg_class c on c.oid=ad.adrelid join pg_attribute a on a.attrelid=ad.adrelid and a.attnum=ad.adnum where c.relname = any($1) and c.relnamespace='public'::regnamespace and pg_get_expr(ad.adbin, ad.adrelid) ~ '[a-z_]+\\('`, [base]);
for (const x of d.rows as any[]) console.log("default", x.relname, x.attname, x.e);
const a = await db.query(`select proname, prosecdef, proconfig from pg_proc where proname in ('assert_handle_namespace_free','enforce_workspace_slug_suffix','rout_users_minor_sync')`); console.log(a.rows);
const ck = await db.query(`select conrelid::regclass r, pg_get_constraintdef(oid) d from pg_constraint where contype='c' and conrelid = any(select oid from pg_class where relname = any($1) and relnamespace='public'::regnamespace) and pg_get_constraintdef(oid) ~ 'public\\.'`, [base]); console.log(ck.rows);
