import { create } from "zustand";
import { Repository } from "../services/repository";
import { desktopStorage } from "../services/database";
import type { Data } from "../types";
export const repository = new Repository(desktopStorage);
type Store = {
  data: Data | null;
  error: string;
  busy: boolean;
  load: () => Promise<void>;
  run: (job: () => Promise<unknown>) => Promise<boolean>;
  clear: () => void;
};
export function errorMessage(e: unknown) {
  if (e && typeof e === "object" && "issues" in e)
    return (e as { issues: { message: string }[] }).issues
      .map((i) => i.message)
      .join(" · ");
  const s = e instanceof Error ? e.message : String(e);
  if (s.includes("FOREIGN KEY"))
    return "Este item possui registros associados. Você pode pausá-lo para preservar o histórico.";
  if (s.includes("UNIQUE"))
    return "Já existe um registro ativo. Atualize a tela e verifique os dados.";
  return s;
}
export const useApp = create<Store>((set, get) => ({
  data: null,
  error: "",
  busy: false,
  clear: () => set({ error: "" }),
  load: async () => {
    try {
      set({ data: await repository.load(), error: "" });
    } catch (e) {
      set({ error: errorMessage(e) });
    }
  },
  run: async (job) => {
    if (get().busy) return false;
    set({ busy: true, error: "" });
    try {
      await job();
      set({ data: await repository.load() });
      return true;
    } catch (e) {
      set({ error: errorMessage(e) });
      return false;
    } finally {
      set({ busy: false });
    }
  },
}));
