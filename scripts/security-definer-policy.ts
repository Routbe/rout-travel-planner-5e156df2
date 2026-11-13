/**
 * One rule for every SECURITY DEFINER function: it runs with
 * search_path = pg_catalog and nothing else, so no object the caller can put
 * on the path is ever resolved inside it. Shared by the CI tests, both
 * migration runners and the live check; the only exceptions are the shrinking
 * list in scripts/security-definer-legacy.ts.
 */
import { migrationNumber } from "./migration-plan";

/** Migrations from this number on are linted and guarded; older files are immutable history. */
export const DEFINER_GUARD_FROM = 255;

export type DefinerFn = { key: string; searchPath: string[] | null };
export type DefinerFinding = { problem: "not_pinned" | "stale_legacy_entry"; key: string; searchPath?: string[] | null };

/** "schema.name(identity args)", the same key the legacy list uses. */
export const definerKey = (schema: string, name: string, args: string) => `${schema}.${name}(${args})`;

/** search_path from pg_proc.proconfig ("search_path=public, pg_temp"). */
export function searchPathFromConfig(config: readonly string[] | null): string[] | null {
  const entry = config?.find((c) => c.startsWith("search_path="));
  return entry === undefined ? null : splitPath(entry.slice("search_path=".length));
}

/** search_path from pg_get_functiondef ("SET search_path TO 'public', 'pg_temp'"). */
export function searchPathFromDef(def: string): string[] | null {
  const m = /^\s*SET search_path (?:TO|=) (.+)$/m.exec(def);
  return m ? splitPath(m[1]!) : null;
}

function splitPath(value: string): string[] {
  return value.split(",").map((s) => s.trim().replace(/^'(.*)'$/, "$1").replace(/^"(.*)"$/, "$1")).filter(Boolean);
}

export const isPinned = (path: readonly string[] | null) => path !== null && path.length === 1 && path[0] === "pg_catalog";

export function isSecurityDefinerDef(def: string): boolean {
  return /^\s*(?:\w+\s+)*SECURITY DEFINER\b/m.test(def.slice(0, def.indexOf("$function$") < 0 ? undefined : def.indexOf("$function$")));
}

/** Unpinned definers not on the legacy list, and legacy entries that no longer need to be there. */
export function definerFindings(fns: readonly DefinerFn[], legacy: readonly string[]): DefinerFinding[] {
  const out: DefinerFinding[] = [];
  const allowed = new Set(legacy);
  const unpinned = new Set<string>();
  for (const f of fns) {
    if (isPinned(f.searchPath)) continue;
    unpinned.add(f.key);
    if (!allowed.has(f.key)) out.push({ problem: "not_pinned", key: f.key, searchPath: f.searchPath });
  }
  for (const key of legacy) if (!unpinned.has(key)) out.push({ problem: "stale_legacy_entry", key });
  return out;
}

/**
 * Static lint of one migration file: every CREATE FUNCTION header marked
 * SECURITY DEFINER sets search_path = pg_catalog, and every search_path the
 * file sets on a function is exactly pg_catalog.
 */
export function definerMigrationViolations(sql: string): string[] {
  const src = sql.replace(/--[^\n]*/g, "");
  const out: string[] = [];
  const header = /create\s+(?:or\s+replace\s+)?function\s+([\w."]+)\s*\(([\s\S]*?)\bas\s+(\$\w*\$|')/gi;
  for (const m of src.matchAll(header)) {
    const head = m[0];
    if (!/\bsecurity\s+definer\b/i.test(head)) continue;
    if (!/\bset\s+search_path\s*(?:=|to)\s*'?pg_catalog'?\s+(?:language|security|stable|volatile|immutable|strict|returns|parallel|cost|rows|set|as)\b/i.test(`${head.replace(/\bas\s+(\$\w*\$|')$/i, "")} as`)) {
      out.push(`${m[1]}: SECURITY DEFINER without set search_path = pg_catalog`);
    }
  }
  for (const m of src.matchAll(/\bset\s+search_path\s*(?:=|to)\s*([^;\n$]+?)(?=\s+(?:language|security|stable|volatile|immutable|strict|returns|parallel|cost|rows|as)\b|;|\n|$)/gi)) {
    const path = splitPath(m[1]!);
    if (!isPinned(path)) out.push(`search_path set to "${m[1]!.trim()}" instead of pg_catalog`);
  }
  return out;
}

export const guardedMigration = (file: string) => migrationNumber(file) >= DEFINER_GUARD_FROM;

/**
 * Runs inside a migration transaction, after the file: raises (and so rolls
 * the migration back) when any SECURITY DEFINER function outside an extension
 * is unpinned and not on the legacy list.
 */
export function definerGuardSql(legacy: readonly string[]): string {
  const list = legacy.map((k) => `'${k.replace(/'/g, "''")}'`).join(",\n      ");
  return `do $definer_guard$
declare bad text;
begin
  select string_agg(k, ', ' order by k) into bad from (
    select n.nspname || '.' || p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')' as k
      from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where p.prosecdef
       and n.nspname not in ('pg_catalog', 'information_schema')
       and not exists (select 1 from pg_catalog.pg_depend d where d.classid = 'pg_catalog.pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
       and not ('search_path=pg_catalog' = any (coalesce(p.proconfig, '{}'::text[])))
  ) x where k <> all (array[
      ${list || "null"}
    ]::text[]);
  if bad is not null then
    raise exception 'SECURITY DEFINER without search_path = pg_catalog: %', bad using errcode = '42501';
  end if;
end $definer_guard$`;
}
