import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
const blob = Bun.file("/tmp/b2/replayed.tar.gz");
const db = new PGlite({ loadDataDir: new Blob([await blob.arrayBuffer()]), extensions: { pgcrypto, btree_gist } });
const base = ['workspace_invites','workspace_members','agent_audit_logs','workspaces','agent_workspace_claims','agent_sandboxes','workspace_profile_drafts','parent_authorizations','users','oauth_clients','tracked_qrs','bookings','workspace_transfers'];
const r = await db.query(`
with recursive t(oid) as (
  select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname = any($1)
  union
  select con.conrelid from pg_constraint con join t on con.confrelid = t.oid where con.contype='f' and con.confdeltype in ('c','n','d')
)
select c.relname, tg.tgname, p.proname, p.prosecdef, p.proconfig, tg.tgenabled
from t join pg_class c on c.oid=t.oid
join pg_trigger tg on tg.tgrelid=c.oid and not tg.tgisinternal
join pg_proc p on p.oid=tg.tgfoid
order by p.prosecdef, p.proconfig nulls first, c.relname`, [base]);
for (const x of r.rows as any[]) console.log(x.relname, x.tgname, x.proname, x.prosecdef ? 'DEFINER':'invoker', JSON.stringify(x.proconfig));
const cl = await db.query(`with recursive t(oid) as (
  select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname = any($1)
  union select con.conrelid from pg_constraint con join t on con.confrelid = t.oid where con.contype='f' and con.confdeltype in ('c','n','d'))
  select count(*) from t`, [base]); console.log(cl.rows);
const h = await db.query(`select p.proname, p.prosecdef, p.proconfig, pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('rout_current_user_id')`);
for (const x of h.rows as any[]) console.log(x.d);
