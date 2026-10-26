import { z } from "zod";
import type { Storage, Statement } from "./database";
import type {
  Data,
  Discipline,
  Topic,
  Questions,
  CycleItem,
  ErrorNote,
  Settings,
} from "../types";
import {
  disciplineSchema,
  topicSchema,
  questionSchema,
  settingsSchema,
  nextReview,
} from "../lib/domain";
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const insert = (
  table: string,
  values: Record<string, string | number | null>,
): Statement => ({
  sql: `INSERT INTO ${table} (${Object.keys(values).join(",")}) VALUES (${Object.keys(
    values,
  )
    .map(() => "?")
    .join(",")})`,
  params: Object.values(values),
});
const update = (
  table: string,
  key: string,
  values: Record<string, string | number | null>,
): Statement => ({
  sql: `UPDATE ${table} SET ${Object.keys(values)
    .map((k) => `${k}=?`)
    .join(",")} WHERE id=?`,
  params: [...Object.values(values), key],
});
export class Repository {
  constructor(private db: Storage) {}
  async load(): Promise<Data> {
    const [
      settings,
      disciplines,
      topics,
      cycle,
      cursors,
      sessions,
      intervals,
      questions,
      errors,
      reviews,
    ] = await Promise.all([
      this.db.select<Settings>("SELECT * FROM settings"),
      this.db.select<Discipline>("SELECT * FROM disciplines ORDER BY name"),
      this.db.select<Topic>("SELECT * FROM topics ORDER BY position,name"),
      this.db.select<CycleItem>("SELECT * FROM cycle_items ORDER BY position"),
      this.db.select<{ cursor: number }>(
        "SELECT cursor FROM study_cycles WHERE id=?",
        ["main"],
      ),
      this.db.select<Data["sessions"][number]>(
        "SELECT * FROM study_sessions ORDER BY started_at DESC",
      ),
      this.db.select<Data["intervals"][number]>(
        "SELECT * FROM session_intervals",
      ),
      this.db.select<Questions>(
        "SELECT * FROM question_records ORDER BY date DESC",
      ),
      this.db.select<ErrorNote>(
        "SELECT * FROM error_notes ORDER BY created_at DESC",
      ),
      this.db.select<Data["reviews"][number]>(
        "SELECT * FROM reviews ORDER BY due_at",
      ),
    ]);
    if (!settings[0])
      throw new Error("Configuração ausente. Restaure um backup válido.");
    return {
      settings: settings[0],
      disciplines,
      topics,
      cycle,
      cursor: cursors[0]?.cursor ?? 0,
      sessions,
      intervals,
      questions,
      errors,
      reviews,
    };
  }
  async onboard(seed: boolean) {
    const statements: Statement[] = [];
    if (seed) {
      const names = [
        "Língua Portuguesa",
        "Raciocínio Lógico",
        "Direito Administrativo",
        "Direito Constitucional",
        "Banco de Dados",
        "Engenharia de Software",
        "Desenvolvimento de Sistemas",
        "Redes de Computadores",
      ];
      names.forEach((name, i) => {
        const did = id();
        statements.push(
          insert("disciplines", {
            id: did,
            name,
            category:
              i < 2
                ? "Conhecimentos Gerais"
                : i < 4
                  ? "Direito"
                  : "Tecnologia da Informação",
            color: ["#60a5fa", "#a78bfa", "#34d399", "#fbbf24"][i % 4],
            priority: 2,
            active: 1,
          }),
          insert("cycle_items", {
            id: id(),
            cycle_id: "main",
            discipline_id: did,
            position: i,
            minutes: 60,
            priority: 2,
            paused: 0,
          }),
        );
      });
    }
    statements.push(update("settings", "1", { onboarding: 1 }));
    await this.db.batch(statements);
  }
  async discipline(value: unknown, key?: string) {
    const v = disciplineSchema.parse(value);
    await this.db.batch([
      key
        ? update("disciplines", key, v)
        : insert("disciplines", { id: id(), ...v }),
    ]);
  }
  async topic(value: unknown, key?: string) {
    const v = topicSchema.parse(value);
    await this.db.batch([
      key ? update("topics", key, v) : insert("topics", { id: id(), ...v }),
    ]);
  }
  async questions(value: unknown, key?: string) {
    const v = questionSchema.parse(value);
    await this.checkTopic(v.discipline_id, v.topic_id);
    await this.db.batch([
      key
        ? update("question_records", key, v)
        : insert("question_records", { id: id(), ...v }),
    ]);
  }
  private async checkTopic(discipline: string, topic: string | null) {
    if (
      topic &&
      !(
        await this.db.select<{ id: string }>(
          "SELECT id FROM topics WHERE id=? AND discipline_id=?",
          [topic, discipline],
        )
      ).length
    )
      throw new Error("O assunto deve pertencer à disciplina.");
  }
  async remove(
    table:
      | "disciplines"
      | "topics"
      | "question_records"
      | "error_notes"
      | "cycle_items"
      | "reviews",
    key: string,
  ) {
    await this.db.batch([
      { sql: `DELETE FROM ${table} WHERE id=?`, params: [key] },
    ]);
  }
  async settings(value: unknown) {
    await this.db.batch([update("settings", "1", settingsSchema.parse(value))]);
  }
  async cycle(value: unknown, key?: string) {
    const v = z
      .object({
        discipline_id: z.string().min(1),
        minutes: z.coerce.number().int().min(1).max(480),
        priority: z.coerce.number().int().min(1).max(5),
        paused: z.coerce.number().int().min(0).max(1),
        position: z.coerce.number().int().min(0),
      })
      .parse(value);
    await this.db.batch([
      key
        ? update("cycle_items", key, v)
        : insert("cycle_items", { id: id(), cycle_id: "main", ...v }),
    ]);
  }
  async reorder(
    items: CycleItem[],
    from: number,
    to: number,
    currentId?: string,
  ) {
    const sorted = [...items];
    const [item] = sorted.splice(from, 1);
    sorted.splice(to, 0, item);
    const statements = sorted.map((v, i) =>
      update("cycle_items", v.id, { position: i }),
    );
    statements.push(
      update("study_cycles", "main", {
        cursor: Math.max(
          0,
          sorted.findIndex((v) => v.id === currentId),
        ),
      }),
    );
    await this.db.batch(statements);
  }
  async advance(position: number) {
    await this.db.batch([
      update("study_cycles", "main", { cursor: position + 1 }),
    ]);
  }
  async start(
    discipline: string,
    topic: string | null,
    minutes: number,
    cycleItem: string | null,
    notes = "",
  ) {
    z.string().min(1).parse(discipline);
    z.number().int().min(1).max(480).parse(minutes);
    z.string().max(10000).parse(notes);
    await this.checkTopic(discipline, topic);
    const sid = id(),
      stamp = now();
    await this.db.batch([
      insert("study_sessions", {
        id: sid,
        discipline_id: discipline,
        topic_id: topic,
        cycle_item_id: cycleItem,
        planned_minutes: minutes,
        started_at: stamp,
        state: "running",
        notes,
      }),
      insert("session_intervals", {
        id: id(),
        session_id: sid,
        started_at: stamp,
        checkpoint_at: stamp,
      }),
    ]);
  }
  async pause(sid: string) {
    await this.db.batch([
      {
        sql: "UPDATE session_intervals SET ended_at=checkpoint_at WHERE session_id=? AND ended_at IS NULL",
        params: [sid],
      },
      {
        sql: "UPDATE study_sessions SET state='paused' WHERE id=? AND state IN('running','recovery')",
        params: [sid],
      },
    ]);
  }
  async resume(sid: string) {
    const stamp = now();
    await this.db.batch([
      {
        sql: "UPDATE study_sessions SET state='running' WHERE id=? AND state='paused'",
        params: [sid],
      },
      {
        sql: "INSERT INTO session_intervals(id,session_id,started_at,checkpoint_at) SELECT ?,id,?,? FROM study_sessions WHERE id=? AND state='running' AND NOT EXISTS(SELECT 1 FROM session_intervals WHERE session_id=? AND ended_at IS NULL)",
        params: [id(), stamp, stamp, sid, sid],
      },
    ]);
  }
  async recover(sid: string, minutes: number) {
    z.number().min(0).max(480).parse(minutes);
    const sessions = await this.db.select<{ state: string }>(
      "SELECT state FROM study_sessions WHERE id=?",
      [sid],
    );
    if (sessions[0]?.state !== "recovery")
      throw new Error("Esta sessão não está aguardando recuperação.");
    const checkpoints = await this.db.select<{ last: string | null }>(
      "SELECT MAX(checkpoint_at) AS last FROM session_intervals WHERE session_id=?",
      [sid],
    );
    const gap = checkpoints[0]?.last
      ? Math.max(0, (Date.now() - Date.parse(checkpoints[0].last)) / 60000)
      : 0;
    if (minutes > gap)
      throw new Error(
        "O ajuste não pode ultrapassar o período desde o último checkpoint.",
      );
    const stamp = now();
    const statements: Statement[] = [
      {
        sql: "UPDATE session_intervals SET ended_at=checkpoint_at WHERE session_id=? AND ended_at IS NULL",
        params: [sid],
      },
      update("study_sessions", sid, { state: "paused" }),
    ];
    if (minutes > 0)
      statements.push(
        insert("session_intervals", {
          id: id(),
          session_id: sid,
          started_at: new Date(Date.now() - minutes * 60000).toISOString(),
          checkpoint_at: stamp,
          ended_at: stamp,
        }),
      );
    await this.db.batch(statements);
  }
  async finish(sid: string, notes: string) {
    z.string().max(10000).parse(notes);
    await this.db.batch([
      {
        sql: "UPDATE study_sessions SET state='completed',ended_at=?,notes=? WHERE id=? AND state!='completed'",
        params: [now(), notes, sid],
      },
    ]);
  }
  async notes(sid: string, notes: string) {
    z.string().max(10000).parse(notes);
    await this.db.batch([
      {
        sql: "UPDATE study_sessions SET notes=? WHERE id=? AND state!='completed'",
        params: [notes, sid],
      },
    ]);
  }
  async discard(sid: string) {
    await this.db.batch([
      {
        sql: "DELETE FROM study_sessions WHERE id=? AND state!='completed'",
        params: [sid],
      },
    ]);
  }
  async error(value: unknown, key?: string) {
    const v = z
      .object({
        discipline_id: z.string().min(1),
        topic_id: z.string().nullable(),
        description: z.string().trim().min(1).max(10000),
        explanation: z.string().max(10000),
        source: z.string().max(2000),
        reviewed: z.coerce.number().int().min(0).max(1),
      })
      .parse(value);
    await this.checkTopic(v.discipline_id, v.topic_id);
    await this.db.batch([
      key
        ? update("error_notes", key, v)
        : insert("error_notes", { id: id(), created_at: now(), ...v }),
    ]);
  }
  async schedule(topic: string, days: number[]) {
    await this.db.batch([
      insert("reviews", {
        id: id(),
        topic_id: topic,
        due_at: nextReview(new Date(), days, 0)!,
        stage: 0,
        state: "pending",
      }),
    ]);
  }
  async postpone(rid: string, date: string) {
    z.iso.datetime().parse(date);
    await this.db.batch([update("reviews", rid, { due_at: date })]);
  }
  async completeReview(
    rid: string,
    performance: number | null,
    days: number[],
  ) {
    z.number().int().min(0).max(100).nullable().parse(performance);
    const rows = await this.db.select<Data["reviews"][number]>(
      "SELECT * FROM reviews WHERE id=? AND state='pending'",
      [rid],
    );
    const r = rows[0];
    if (!r) throw new Error("Revisão já concluída ou removida.");
    const due = nextReview(new Date(), days, r.stage + 1);
    const statements = [
      update("reviews", rid, {
        state: "done",
        completed_at: now(),
        performance,
      }),
    ];
    if (due)
      statements.push(
        insert("reviews", {
          id: id(),
          topic_id: r.topic_id,
          due_at: due,
          stage: r.stage + 1,
          state: "pending",
        }),
      );
    await this.db.batch(statements);
  }
}
