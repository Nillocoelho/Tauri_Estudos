// Browser exercises the real UI and SQLite service SQL. Native dialogs/tray/notifications are covered separately.
import { test, expect } from "@playwright/test";
import { testDatabase } from "../support/sqlite";
test("plano, disciplinas, cronômetro, questões, histórico e persistência", async ({
  page,
}) => {
  const { db } = testDatabase();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.exposeBinding(
    "testInvoke",
    async (
      _,
      { command, args }: { command: string; args: Record<string, unknown> },
    ) => {
      if (command === "plugin:sql|load") return args.db;
      if (command === "plugin:sql|select")
        return db
          .prepare(String(args.query))
          .all(...(args.values as (string | number | null)[]));
      if (command === "atomic_write") {
        db.exec("BEGIN");
        try {
          for (const s of args.statements as {
            sql: string;
            params: (string | number | null)[];
          }[])
            db.prepare(s.sql).run(...s.params);
          db.exec("COMMIT");
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
        return;
      }
      if (command === "plugin:event|listen") return 1;
      if (command === "plugin:event|unlisten") return;
      throw new Error("IPC não simulado: " + command);
    },
  );
  await page.addInitScript(() => {
    const win = window as unknown as {
      isTauri: boolean;
      __TAURI_INTERNALS__: unknown;
      __TAURI_EVENT_PLUGIN_INTERNALS__: unknown;
      testInvoke: (v: unknown) => Promise<unknown>;
    };
    win.isTauri = true;
    win.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    win.__TAURI_INTERNALS__ = {
      invoke: (command: string, args: unknown) =>
        win.testInvoke({ command, args }),
      transformCallback: () => 1,
      unregisterCallback: () => {},
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Criar plano sugerido" }).click();
  await expect(
    page.getByRole("heading", { name: "Seu caminho até a aprovação" }),
  ).toBeVisible();
  await page.screenshot({ path: "artifacts/dashboard.png", fullPage: true });
  await page.getByRole("link", { name: "Disciplinas", exact: true }).click();
  await page.getByRole("button", { name: "Nova disciplina" }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Administração Pública");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Administração Pública", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Administração Pública", exact: true })
    .click();
  await page.getByRole("button", { name: "Assunto", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Assunto", exact: true })
    .fill("Gestão de pessoas");
  await page
    .getByLabel("Link da aula (opcional)")
    .fill("https://www.grancursosonline.com.br/");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Gestão de pessoas" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await page.getByRole("link", { name: "Iniciar estudo", exact: true }).click();
  await page
    .getByRole("button", { name: "Iniciar estudo", exact: true })
    .click();
  db.prepare(
    "UPDATE session_intervals SET checkpoint_at=strftime('%Y-%m-%dT%H:%M:%fZ',started_at,'+5 minutes')",
  ).run();
  await page.getByRole("button", { name: "Pausar", exact: true }).click();
  await expect(
    page.getByText("Sessão pausada", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retomar", exact: true }).click();
  await page.getByLabel("Observações").fill("Estudo de leitura e exercícios");
  await page
    .getByRole("button", { name: "Finalizar sessão", exact: true })
    .click();
  expect(
    db
      .prepare(
        "SELECT count(*) AS n FROM study_sessions WHERE state='completed'",
      )
      .get()?.n,
  ).toBe(1);
  await page.getByRole("link", { name: "Questões", exact: true }).click();
  await page
    .getByRole("button", { name: "Registrar questões", exact: true })
    .click();
  const did = db.prepare("SELECT id FROM disciplines LIMIT 1").get()
    ?.id as string;
  await page.getByLabel("Disciplina", { exact: true }).selectOption(did);
  await page.getByLabel("Quantidade de questões").fill("20");
  await page.getByLabel("Acertos", { exact: true }).fill("15");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByText("75%", { exact: true }).first()).toBeVisible();
  await page.getByRole("link", { name: "Histórico", exact: true }).click();
  await expect(page.getByText("Estudo de leitura e exercícios")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Estudo de leitura e exercícios")).toBeVisible();
  await page.setViewportSize({ width: 800, height: 700 });
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Seu caminho até a aprovação" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "Configurações", exact: true }).click();
  await page.getByRole("button", { name: "Editar configurações" }).click();
  await page.getByLabel("Aparência").selectOption("light");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.screenshot({
    path: "artifacts/settings-light.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  db.close();
});
