import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { Repository } from "../../src/services/repository";
import type { Storage, Statement } from "../../src/services/database";
export function testDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec(
    readFileSync(
      new URL("../../src-tauri/migrations/001_initial.sql", import.meta.url),
      "utf8",
    ),
  );
  db.exec(
    readFileSync(
      new URL("../../src-tauri/migrations/002_integrity.sql", import.meta.url),
      "utf8",
    ),
  );
  const storage: Storage = {
    // Same ordered migrations registered in the desktop SQL plugin.
    async select<T>(sql: string, params: unknown[] = []) {
      return db
        .prepare(sql)
        .all(...(params as (string | number | null)[])) as T[];
    },
    async batch(statements: Statement[]) {
      db.exec("BEGIN");
      try {
        for (const s of statements) db.prepare(s.sql).run(...s.params);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
  return { db, storage, repository: new Repository(storage) };
}
