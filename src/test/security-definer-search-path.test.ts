// @vitest-environment node
/**
 * Every SECURITY DEFINER function runs with search_path = pg_catalog, except
 * the shrinking list in scripts/security-definer-legacy.ts. Checked on the
 * committed schema snapshot (replayed from db/), on every migration file from
 * 0255 on, and on the guard both runners run inside each migration.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listMigrationFiles } from "../../scripts/migration-plan";
import { LEGACY_DEFINER_SEARCH_PATH } from "../../scripts/security-definer-legacy";
import {
  definerFindings,
  definerGuardSql,
  definerKey,
  definerMigrationViolations,
  guardedMigration,
  isSecurityDefinerDef,
  searchPathFromConfig,
  searchPathFromDef,
} from "../../scripts/security-definer-policy";

const DB_DIR = join(__dirname, "..", "..", "db");
type SnapshotFn = { schema: string; name: string; args: string; def: string };
const snapshot = JSON.parse(readFileSync(join(DB_DIR, "schema.snapshot.json"), "utf8")) as { functions: SnapshotFn[] };
const definers = snapshot.functions
  .filter((f) => isSecurityDefinerDef(f.def))
  .map((f) => ({ key: definerKey(f.schema, f.name, f.args), searchPath: searchPathFromDef(f.def) }));

const BATCH_1 = [
  "public.rout_card_design(s text)",
  "public.rout_card_frozen(s text)",
  "public.rout_card_generation(u uuid)",
  "public.rout_card_status_by_serial(s text)",
  "public.rout_card_status_by_hardware(hid uuid)",
  "public.rout_card_token_use(n text, exp timestamp with time zone)",
  "public.rout_hw_issue_challenge(hid uuid, nh text)",
  "public.rout_hw_consume_challenge(hid uuid, nh text)",
  "public.rout_hw_record_scan(hid uuid, ok boolean)",
  "public.rout_pair_factory_card(hid uuid, proof_hash text, serial text)",
  "public.rout_physical_key_audit()",
  "public.rout_ephemeral_vault_create(p_vault_id uuid, p_key_hash text, p_vault_hash text, p_payload text)",
  "public.rout_ephemeral_vault_read(p_vault_id uuid)",
  "public.rout_ephemeral_vault_commit(p_vault_id uuid, p_vault_hash text, p_name text, p_slug text, p_blob text, p_key_id text)",
  "public.rout_purge_expired_ephemeral_vaults()",
  "public.signin_guard_status(_identity_hash text)",
  "public.signin_guard_record(_identity_hash text, _success boolean)",
  "public.rout_resolve_account(p_identifier text)",
  "public.email_freeze_owner(token_hash text)",
  "public.delete_account()",
  "public.handle_new_user()",
];

describe("SECURITY DEFINER functions in the schema snapshot", () => {
  it("are pinned to pg_catalog unless on the legacy list, and the list has no stale entries", () => {
    expect(definers.length).toBeGreaterThan(300);
    expect(definerFindings(definers, LEGACY_DEFINER_SEARCH_PATH)).toEqual([]);
  });

  it("batch 1 (cards, vault, sign-in) is pinned and off the legacy list; 115 remain", () => {
    for (const key of BATCH_1) {
      expect(definers.find((f) => f.key === key)?.searchPath, key).toEqual(["pg_catalog"]);
      expect(LEGACY_DEFINER_SEARCH_PATH, key).not.toContain(key);
    }
    expect(LEGACY_DEFINER_SEARCH_PATH).toHaveLength(115);
    expect(new Set(LEGACY_DEFINER_SEARCH_PATH).size).toBe(115);
  });

  it("vault_enclave has no exception at all", () => {
    expect(LEGACY_DEFINER_SEARCH_PATH.filter((k) => k.startsWith("vault_enclave."))).toEqual([]);
    expect(definers.filter((f) => f.key.startsWith("vault_enclave.")).every((f) => f.searchPath?.join() === "pg_catalog")).toBe(true);
  });

  it("flags an unpinned function that is not listed, and a listed function that is already pinned", () => {
    expect(definerFindings([{ key: "public.x()", searchPath: ["public"] }], [])).toEqual([
      { problem: "not_pinned", key: "public.x()", searchPath: ["public"] },
    ]);
    expect(definerFindings([{ key: "public.x()", searchPath: ["pg_catalog", "public"] }], [])[0]?.problem).toBe("not_pinned");
    expect(definerFindings([{ key: "public.x()", searchPath: null }], [])[0]?.problem).toBe("not_pinned");
    expect(definerFindings([{ key: "public.x()", searchPath: ["pg_catalog"] }], ["public.x()"])).toEqual([
      { problem: "stale_legacy_entry", key: "public.x()" },
    ]);
  });

  it("reads search_path the same way from proconfig and from the function definition", () => {
    expect(searchPathFromConfig(["search_path=public, pg_temp"])).toEqual(["public", "pg_temp"]);
    expect(searchPathFromConfig(["search_path=pg_catalog"])).toEqual(["pg_catalog"]);
    expect(searchPathFromConfig(null)).toBeNull();
    expect(searchPathFromDef(" SECURITY DEFINER\n SET search_path TO 'public', 'pg_temp'\nAS $function$")).toEqual(["public", "pg_temp"]);
    expect(searchPathFromDef(" SECURITY DEFINER\n SET search_path TO 'pg_catalog'\nAS $function$")).toEqual(["pg_catalog"]);
  });
});

describe("migration files from 0255 on", () => {
  const guarded = listMigrationFiles(DB_DIR).filter(guardedMigration);

  it("include 0255 and none sets a search_path other than pg_catalog", () => {
    expect(guarded).toContain("0255_definer_search_path_cards_vault_auth.sql");
    for (const file of guarded) expect(definerMigrationViolations(readFileSync(join(DB_DIR, file), "utf8")), file).toEqual([]);
  });

  it("0255 only changes search_path settings and one PUBLIC grant", () => {
    const sql = readFileSync(join(DB_DIR, "0255_definer_search_path_cards_vault_auth.sql"), "utf8").replace(/--[^\n]*/g, "");
    const statements = sql.split(";").map((s) => s.trim()).filter(Boolean);
    expect(statements).toHaveLength(22);
    for (const s of statements) expect(s).toMatch(/^(alter function public\.\w+\([^)]*\) set search_path = pg_catalog|revoke execute on function public\.rout_physical_key_audit\(\) from public)$/);
  });

  it("the lint rejects a definer without pg_catalog and accepts a pinned one", () => {
    expect(definerMigrationViolations("create function public.a() returns int language sql security definer as $$ select 1 $$;")).toHaveLength(1);
    expect(definerMigrationViolations("create or replace function public.a() returns int language sql security definer set search_path = public as $$ select 1 $$;").length).toBeGreaterThan(0);
    expect(definerMigrationViolations("alter function public.a() set search_path = public, pg_temp;")).toHaveLength(1);
    expect(definerMigrationViolations("create function public.a() returns int language plpgsql as $$ begin set local search_path to public; return 1; end $$;")).toHaveLength(1);
    expect(definerMigrationViolations("create function public.a() returns int language sql security definer set search_path = pg_catalog as $$ select 1 $$;")).toEqual([]);
    expect(definerMigrationViolations("create function public.a() returns int language sql set search_path = pg_catalog security definer as $$ select 1 $$;")).toEqual([]);
    expect(definerMigrationViolations("alter function public.a() set search_path = pg_catalog;")).toEqual([]);
  });
});

describe("the runner guard inside a migration transaction", () => {
  it("raises for an unlisted unpinned definer and passes for pinned or listed ones", async () => {
    const db = new PGlite();
    try {
      await db.exec(`create function public.pinned() returns int language sql security definer set search_path = pg_catalog as $$ select 1 $$;
        create function public.listed(p int) returns int language sql security definer set search_path = public as $$ select p $$;
        create function public.invoker() returns int language sql set search_path = public as $$ select 1 $$;`);
      await expect(db.exec(definerGuardSql(["public.listed(p integer)"]))).resolves.toBeDefined();
      await expect(db.exec(definerGuardSql([]))).rejects.toThrow(/public\.listed\(p integer\)/);
      await db.exec("create function public.sneaky() returns int language sql security definer set search_path = public, pg_temp as $$ select 1 $$;");
      await expect(db.exec(definerGuardSql(["public.listed(p integer)"]))).rejects.toThrow(/SECURITY DEFINER without search_path = pg_catalog: public\.sneaky\(\)/);
    } finally {
      await db.close();
    }
  }, 60_000);
});

describe("batch 1 functions still run with search_path = pg_catalog (all migrations replayed)", () => {
  it("resolve every table and helper they touch", async () => {
    const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
    const { pgcrypto } = await import("@electric-sql/pglite/contrib/pgcrypto");
    const { planMigrations } = await import("../../scripts/migration-plan");
    const db = new PGlite({ extensions: { pgcrypto, btree_gist } });
    try {
      for (const step of planMigrations(listMigrationFiles(DB_DIR), new Set())) {
        if (step.action === "run") await db.exec(`begin;\n${readFileSync(join(DB_DIR, step.file), "utf8")}\n;commit;`);
      }
      // Lookups that a misplaced search_path would break: undefined table, function, type, column or schema.
      const unresolved = /^42(P01|883|704|703|3F)$/;
      const id = "00000000-0000-4000-8000-0000000000c1";
      const calls = [
        ["select public.rout_card_design('S1')"],
        ["select public.rout_card_frozen('S1')"],
        ["select public.rout_card_generation($1::uuid)", id],
        ["select public.rout_card_status_by_serial('S1')"],
        ["select public.rout_card_status_by_hardware($1::uuid)", id],
        ["select public.rout_card_token_use('AAAAAAAAAAAAAAAAAAAAAA', now() + interval '30 seconds')"],
        ["select public.rout_card_token_use('bad', now())"],
        ["select public.rout_hw_issue_challenge($1::uuid, repeat('a', 64))", id],
        ["select * from public.rout_hw_consume_challenge($1::uuid, repeat('a', 64))", id],
        ["select public.rout_hw_record_scan($1::uuid, true)", id],
        ["select public.rout_pair_factory_card($1::uuid, repeat('a', 64), 'S1')", id],
        ["select public.rout_ephemeral_vault_create($1::uuid, 'k', 'h', 'p')", id],
        ["select * from public.rout_ephemeral_vault_read($1::uuid)", id],
        ["select * from public.rout_ephemeral_vault_commit($1::uuid, 'h', 'n', 's', 'b', 'k')", id],
        ["select public.rout_purge_expired_ephemeral_vaults()"],
        ["select public.signin_guard_status(repeat('b', 32))"],
        ["select public.signin_guard_record(repeat('b', 32), false)"],
        ["select public.signin_guard_record(repeat('b', 32), true)"],
        ["select * from public.rout_resolve_account('@nobody')"],
        ["select public.email_freeze_owner('x')"],
        ["select public.delete_account()"],
      ] as const;
      const failures: string[] = [];
      for (const [sql, ...params] of calls) {
        await db.exec("begin");
        try {
          await db.query(sql, [...params]);
        } catch (error) {
          const code = (error as { code?: string }).code ?? "";
          if (unresolved.test(code)) failures.push(`${sql}: ${code} ${(error as Error).message}`);
        } finally {
          await db.exec("rollback");
        }
      }
      expect(failures).toEqual([]);
      expect(calls).toHaveLength(21);
    } finally {
      await db.close();
    }
  }, 120_000);

  it("would catch an unqualified table under the same setting", async () => {
    const db = new PGlite();
    try {
      await db.exec(`create table public.t (x int);
        create function public.bad() returns bigint language sql security definer set search_path = pg_catalog as $$ select count(*) from public.t $$;`);
      await expect(db.query("select public.bad()")).resolves.toBeDefined();
      await db.exec("create or replace function public.bad2() returns bigint language plpgsql security definer set search_path = pg_catalog as $$ begin return (select count(*) from t); end $$;");
      await expect(db.query("select public.bad2()")).rejects.toMatchObject({ code: "42P01" });
    } finally {
      await db.close();
    }
  }, 60_000);
});
