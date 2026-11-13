import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listMigrationFiles, planMigrations } from "/dev-server/scripts/migration-plan";
const DB_DIR = "/dev-server/db";
const db = new PGlite({ extensions: { pgcrypto, btree_gist } });
for (const step of planMigrations(listMigrationFiles(DB_DIR), new Set())) {
  if (step.action === "run") await db.exec(`begin;\n${readFileSync(join(DB_DIR, step.file), "utf8")}\n;commit;`);
}
const dump = await db.dumpDataDir("gzip");
await Bun.write("/tmp/b2/replayed.tar.gz", dump);
console.log("ok");
