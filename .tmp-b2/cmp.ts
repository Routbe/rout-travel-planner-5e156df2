import { replayed } from "./replaylib";
import { LEGACY_DEFINER_SEARCH_PATH } from "../scripts/security-definer-legacy";
const live = JSON.parse(await Bun.file("/tmp/b2/live.json").text()).rows as any[];
const db = await replayed();
const r = await db.query(`select n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' as k, md5(pg_get_functiondef(p.oid)) as h from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef`);
const rep = new Map((r.rows as any[]).map(x => [x.k, x.h]));
const re = /rout_agent_|rout_claim_agent|agent_sandbox|rout_parent_|rout_record_signup_age|rout_user_is_minor|workspace|rout_transfer/;
const picked = LEGACY_DEFINER_SEARCH_PATH.filter(k => re.test(k));
let bad = 0;
for (const k of picked) { const l = live.find(x => x.k === k); const ok = l && l.h === rep.get(k) && l.owner==='neondb_owner'; if (!ok) { bad++; console.log("DIFF", k, l?.h, rep.get(k)); } }
console.log("live rows", live.length, "picked", picked.length, "diffs", bad);
console.log("acls", [...new Set(live.filter(x=>picked.includes(x.k)).map(x => x.acl))]);
console.log("extra live", live.filter(x=>!picked.includes(x.k)).map(x=>x.k+" "+x.cfg));
