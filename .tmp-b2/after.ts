import { replayed } from "./replaylib";
import { LEGACY_DEFINER_SEARCH_PATH, HARDENED_BY_MIGRATION } from "../scripts/security-definer-legacy";
import { definerFindings, searchPathFromConfig } from "../scripts/security-definer-policy";
const rows = JSON.parse(await Bun.file("/tmp/b2/after.json").text()).rows as any[];
const b2 = HARDENED_BY_MIGRATION[256]!;
const unpinned = rows.filter(r => !b2.includes(r.k));
const findings = definerFindings(rows.map(r => ({ key: r.k, searchPath: searchPathFromConfig(r.cfg) })), LEGACY_DEFINER_SEARCH_PATH);
console.log("rows", rows.length, "unpinned (non-batch2)", unpinned.length, "findings", JSON.stringify(findings));
const db = await replayed();
const r = await db.query(`select n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' as k, md5(pg_get_functiondef(p.oid)) as h from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef`);
const rep = new Map((r.rows as any[]).map(x => [x.k, x.h]));
let diff = 0; for (const k of b2) { const l = rows.find(x => x.k === k); if (!l || l.h !== rep.get(k) || l.access !== "neondb_owner {neondb_owner=X/neondb_owner,rout_app=X/neondb_owner}" || l.cfg.join() !== "search_path=pg_catalog") { diff++; console.log("DIFF", k); } }
console.log("batch2 live==snapshot, owner+grants unchanged:", b2.length - diff, "/", b2.length);
