import { readFileSync, writeFileSync } from "node:fs";
const p = JSON.parse(readFileSync("/tmp/b2/payload.json", "utf8"));
const count = (expect: number, label: string) => `do $g$ declare n int; begin
  select count(*) into n from pg_catalog.pg_proc p join pg_catalog.pg_namespace s on s.oid = p.pronamespace
   where p.prosecdef and s.nspname not in ('pg_catalog', 'information_schema')
     and not exists (select 1 from pg_catalog.pg_depend d where d.classid = 'pg_catalog.pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
     and not ('search_path=pg_catalog' = any (coalesce(p.proconfig, '{}'::text[])));
  if n <> ${expect} then raise exception '${label}: expected ${expect} unpinned SECURITY DEFINER functions, found %', n using errcode = '42501'; end if;
end $g$`;
const alters = p.queries.slice(0, 36);
const record = p.queries[37];
const out = { queries: [{ query: count(115, "before"), params: [] }, ...alters, { query: count(79, "after"), params: [] }, record] };
writeFileSync("/tmp/b2/compact.json", JSON.stringify(out));
console.log(JSON.stringify(out));
