import { describe, it, expect, afterEach, vi } from "vitest";
import { testDatabase } from "./support/sqlite";
import { seconds, nextCycle } from "../src/lib/domain";
afterEach(() => vi.useRealTimers());
describe("SQLite real e serviços", () => {
  it("migrations criam banco íntegro sem histórico fictício", async () => {
    const { repository, db } = testDatabase();
    const d = await repository.load();
    expect(d.disciplines).toHaveLength(0);
    expect(d.sessions).toHaveLength(0);
    expect(d.questions).toHaveLength(0);
    expect(db.prepare("PRAGMA integrity_check").get()).toEqual({
      integrity_check: "ok",
    });
    db.close();
  });
  it("plano inicial editável sem sessões e onboarding atômico", async () => {
    const { repository, db } = testDatabase();
    await repository.onboard(true);
    const d = await repository.load();
    expect(d.disciplines).toHaveLength(8);
    expect(d.cycle).toHaveLength(8);
    expect(d.settings.onboarding).toBe(1);
    expect(d.sessions).toHaveLength(0);
    db.close();
  });
  it("inicia, pausa, retoma, recupera e conclui avançando o ciclo uma única vez", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T19:00:00Z"));
    const { repository, db } = testDatabase();
    await repository.onboard(true);
    let d = await repository.load();
    const next = nextCycle(d.cycle, d.cursor)!;
    await repository.start(next.discipline_id, null, 25, next.id);
    d = await repository.load();
    const sid = d.sessions[0].id;
    db.prepare("UPDATE session_intervals SET checkpoint_at=?").run(
      "2026-10-20T19:10:00.000Z",
    );
    await repository.pause(sid);
    vi.setSystemTime(new Date("2026-10-20T19:15:00Z"));
    await repository.resume(sid);
    db.prepare(
      "UPDATE session_intervals SET checkpoint_at=? WHERE ended_at IS NULL",
    ).run("2026-10-20T19:20:00.000Z");
    db.prepare("UPDATE study_sessions SET state='recovery' WHERE id=?").run(
      sid,
    );
    await repository.recover(sid, 0);
    d = await repository.load();
    expect(seconds(d, d.sessions[0])).toBe(900);
    expect(d.sessions[0].state).toBe("paused");
    await repository.finish(sid, "Concluído");
    d = await repository.load();
    expect(d.cursor).toBe(1);
    expect(d.sessions[0].notes).toBe("Concluído");
    await repository.finish(sid, "Duplicado");
    expect((await repository.load()).cursor).toBe(1);
    db.close();
  });
  it("protege a única sessão ativa e reverte falhas transacionais", async () => {
    const { repository, db } = testDatabase();
    await repository.onboard(true);
    const d = await repository.load();
    await repository.start(d.disciplines[0].id, null, 25, null);
    await expect(
      repository.start(d.disciplines[1].id, null, 25, null),
    ).rejects.toThrow();
    expect((await repository.load()).intervals).toHaveLength(1);
    await repository.discard((await repository.load()).sessions[0].id);
    expect((await repository.load()).cursor).toBe(0);
    expect((await repository.load()).intervals).toHaveLength(0);
    db.close();
  });
  it("valida questões e integridade referencial e permite editar/excluir", async () => {
    const { repository, db } = testDatabase();
    await repository.onboard(true);
    const did = (await repository.load()).disciplines[0].id;
    const v = {
      discipline_id: did,
      topic_id: null,
      total: 20,
      correct: 15,
      date: "2026-10-20",
      board: "Banca",
      notes: "",
    };
    await repository.questions(v);
    let q = (await repository.load()).questions[0];
    expect(q.errors).toBe(5);
    await repository.questions({ ...v, correct: 18 }, q.id);
    expect((await repository.load()).questions[0].errors).toBe(2);
    await expect(repository.remove("disciplines", did)).rejects.toThrow();
    await expect(repository.questions({ ...v, correct: 25 })).rejects.toThrow();
    await repository.remove("question_records", q.id);
    expect((await repository.load()).questions).toHaveLength(0);
    db.close();
  });
  it("revisões não geram sessões e não duplicam pendências", async () => {
    const { repository, db } = testDatabase();
    await repository.onboard(true);
    const did = (await repository.load()).disciplines[0].id;
    await repository.topic({
      discipline_id: did,
      name: "SQL",
      position: 0,
      status: "Não iniciado",
      notes: "",
      lesson_url: "",
      pdf_url: "",
      questions_url: "",
    });
    const t = (await repository.load()).topics[0];
    await repository.schedule(t.id, [1, 7, 30]);
    await expect(repository.schedule(t.id, [1, 7, 30])).rejects.toThrow();
    const r = (await repository.load()).reviews[0];
    await repository.completeReview(r.id, 70, [1, 7, 30]);
    const d = await repository.load();
    expect(d.reviews.filter((r) => r.state === "pending")).toHaveLength(1);
    expect(d.reviews.filter((r) => r.state === "done")).toHaveLength(1);
    expect(d.sessions).toHaveLength(0);
    db.close();
  });
  it("propaga falhas do banco sem apresentar sucesso", async () => {
    const { repository, db } = testDatabase();
    db.close();
    await expect(repository.load()).rejects.toThrow();
  });
});
