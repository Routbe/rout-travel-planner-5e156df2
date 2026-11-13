import { replayed } from "./replaylib";
const db = await replayed();
const names = process.argv.slice(2);
const h = await db.query(`select pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname = any($1)`, [names]);
for (const x of h.rows as any[]) console.log(x.d, "\n-----");
const t = await db.query(`select c.relname, tg.tgname, pg_get_triggerdef(tg.oid) d from pg_trigger tg join pg_class c on c.oid=tg.tgrelid join pg_proc p on p.oid=tg.tgfoid where p.proname = any($1) and not tg.tgisinternal`, [names]);
for (const x of t.rows as any[]) console.log(x.d);
