import { readFileSync, writeFileSync } from "node:fs";
import { checksumOf, splitSql } from "../scripts/migration-plan";
import { migrationDefinerGuardSql, definerMigrationViolations } from "../scripts/security-definer-policy";
const file = "0256_definer_search_path_workspaces_parents_agents.sql";
const body = readFileSync(`db/${file}`, "utf8");
const lint = definerMigrationViolations(body); if (lint.length) throw new Error(lint.join());
const queries = [...splitSql(body).map((query) => ({ query, params: [] })), { query: migrationDefinerGuardSql(file), params: [] },
  { query: "insert into public.schema_migrations (filename, checksum) values ($1, $2)", params: [file, checksumOf(body)] }];
writeFileSync("/tmp/b2/payload.json", JSON.stringify({ queries }));
console.log(queries.length, checksumOf(body), queries[36].query.length);
