import Database from "@tauri-apps/plugin-sql";
import { invoke, isTauri } from "@tauri-apps/api/core";
export type Statement = { sql: string; params: (string | number | null)[] };
export interface Storage {
  select<T>(sql: string, params?: unknown[]): Promise<T[]>;
  batch(statements: Statement[]): Promise<void>;
}
let connection: Promise<Database> | undefined;
export const desktopStorage: Storage = {
  async select<T>(sql: string, params: unknown[] = []) {
    if (!isTauri())
      throw new Error(
        "Abra a versão desktop para usar o banco SQLite. O modo navegador não grava dados.",
      );
    connection ??= Database.load("sqlite:aprovacao.db").catch((e) => {
      connection = undefined;
      throw e;
    });
    return (await connection).select<T[]>(sql, params);
  },
  async batch(statements) {
    await invoke("atomic_write", { statements });
  },
};
