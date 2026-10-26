import { openUrl } from "@tauri-apps/plugin-opener";
import { urlSchema } from "../lib/domain";
import { useApp, errorMessage } from "../app/store";
export async function openMaterial(value: string) {
  try {
    const url = urlSchema.parse(value);
    if (!url) throw new Error("Cadastre um link de material.");
    await openUrl(url);
  } catch (e) {
    useApp.setState({ error: errorMessage(e) });
  }
}
