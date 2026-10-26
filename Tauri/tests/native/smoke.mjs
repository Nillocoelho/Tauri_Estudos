import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const exe = new URL(
  "../../src-tauri/target/debug/projeto-aprovacao.exe",
  import.meta.url,
);
const { fileURLToPath } = await import("node:url");
const processes = [];
let currentPage;
async function start() {
  const process = spawn(fileURLToPath(exe), [], {
    windowsHide: true,
    env: {
      ...globalThis.process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:
        "--remote-debugging-port=9223 --remote-debugging-address=127.0.0.1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  processes.push(process);
  process.stderr.on("data", (d) => globalThis.process.stderr.write(d));
  let browser;
  for (let i = 0; i < 60; i++) {
    try {
      browser = await chromium.connectOverCDP("http://127.0.0.1:9223",{timeout:1000});
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  if (!browser)
    throw new Error(
      "WebView2 de teste não abriu. Código de saída: " + process.exitCode,
    );
  const context = browser.contexts()[0];
  let page = context.pages()[0];
  for (let i = 0; !page && i < 20; i++) {
    await new Promise((r) => setTimeout(r, 250));
    page = context.pages()[0];
  }
  if (!page) throw new Error("Sem janela WebView2");
  currentPage=page;
  return { process, browser, page };
}
try {
  let { process, browser, page } = await start();
  await page
    .getByRole("button", { name: "Criar plano sugerido", exact: true })
    .or(page.getByRole("heading", { name: "Seu caminho até a aprovação" }))
    .first()
    .waitFor({ timeout: 15000 });
  if (
    await page.getByRole("button", { name: "Criar plano sugerido" }).isVisible()
  )
    await page.getByRole("button", { name: "Criar plano sugerido" }).click();
  await page.getByRole("link", { name: "Estudar", exact: true }).click();
  await page.getByRole('heading',{name:'Hora de estudar',exact:true}).waitFor();
  if (
    await page
      .getByRole("button", { name: "Descartar sessão", exact: true })
      .isVisible()
  ) {
    await page
      .getByRole("button", { name: "Descartar sessão", exact: true })
      .click();
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
  }
  await page
    .getByRole("button", { name: "Iniciar estudo", exact: true })
    .click();
  await page.getByRole("button", { name: "Pausar", exact: true }).waitFor();
  await page.waitForFunction(
    () => {
      const t = document.querySelector(".timer")?.textContent;
      return t && Number(t.split(':')[2])>=3;
    },
    {},
    { timeout: 10000 },
  );
  await page.getByRole("button", { name: "Pausar", exact: true }).click();
  await page.getByRole("button", { name: "Retomar", exact: true }).waitFor();
  let paused = await page.locator(".timer").textContent();
  await new Promise((r) => setTimeout(r, 2500));
  assert.equal(await page.locator(".timer").textContent(), paused);
  await page.getByRole("button", { name: "Retomar", exact: true }).click();
  await page.getByRole("button", { name: "Pausar", exact: true }).waitFor();
  await new Promise((r) => setTimeout(r, 2500));
  // Simulate an unexpected process termination. The next launch must require recovery.
  process.kill();
  await new Promise((r) => process.once("exit", r));
  await browser.close().catch(()=>{});
  await new Promise(r=>setTimeout(r,750));
  ({ process, browser, page } = await start());
  await page
    .getByRole("link", { name: "Estudar", exact: true })
    .waitFor({ timeout: 15000 });
  await page.getByRole("link", { name: "Estudar", exact: true }).click();
  await page
    .getByRole("heading", { name: "Vamos recuperar sua sessão" })
    .waitFor();
  await page
    .getByRole("button", { name: "Confirmar tempo e manter pausada" })
    .click();
  await page.getByRole("button", { name: "Retomar", exact: true }).waitFor();
  await page
    .getByLabel("Observações")
    .fill("Teste nativo isolado de recuperação");
  await page
    .getByRole("button", { name: "Finalizar sessão", exact: true })
    .click();
  await page.getByRole("link", { name: "Histórico", exact: true }).click();
  await page.getByText("Teste nativo isolado de recuperação").first().waitFor();
  assert.equal(await page.getByRole("alert").count(), 0);
  await page.screenshot({
    path: "artifacts/native-history.png",
    fullPage: true,
  });
  writeFileSync(
    "artifacts/native-smoke.json",
    JSON.stringify(
      {
        passed: true,
        test: "WebView2 + IPC real + SQLite + worker + pausa/retomada + encerramento inesperado + recuperação + histórico",
        at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log("NATIVE_SMOKE_PASSED");
  await browser.close();
} catch(e) {
  if(currentPage&&!currentPage.isClosed()){writeFileSync('artifacts/native-failure.txt',await currentPage.locator('body').innerText());await currentPage.screenshot({path:'artifacts/native-failure.png',fullPage:true}).catch(()=>{});}
  throw e;
} finally {
  for (const process of processes)
    if (process.exitCode === null) process.kill();
}
