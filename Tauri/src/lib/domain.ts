import { z } from "zod";
import { addDays, startOfWeek, endOfWeek, format } from "date-fns";
import type { CycleItem, Data, Interval, Session } from "../types";
export const urlSchema = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => {
    if (!v) return true;
    try {
      const u = new URL(v);
      return (
        ["https:", "http:"].includes(u.protocol) && !u.username && !u.password
      );
    } catch {
      return false;
    }
  }, "Use um endereço HTTP ou HTTPS válido, sem credenciais.");
export const questionSchema = z
  .object({
    discipline_id: z.string().min(1, "Selecione uma disciplina"),
    topic_id: z.string().nullable(),
    total: z.coerce.number().int().min(1).max(100000),
    correct: z.coerce.number().int().min(0),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((v) => {
        const date = new Date(v + "T12:00:00");
        return !isNaN(date.getTime()) && format(date, "yyyy-MM-dd") === v;
      }, "Data inválida"),
    board: z.string().max(200),
    notes: z.string().max(10000),
  })
  .refine((v) => v.correct <= v.total, {
    message: "Acertos não podem superar o total.",
    path: ["correct"],
  });
export const disciplineSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.enum([
    "Conhecimentos Gerais",
    "Tecnologia da Informação",
    "Direito",
    "Administração",
    "Outras",
  ]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  priority: z.coerce.number().int().min(1).max(5),
  active: z.coerce.number().int().min(0).max(1),
});
export const topicSchema = z.object({
  discipline_id: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  position: z.coerce.number().int().min(0),
  status: z.enum([
    "Não iniciado",
    "Em andamento",
    "Estudado",
    "Revisão necessária",
  ]),
  notes: z.string().max(10000),
  lesson_url: urlSchema,
  pdf_url: urlSchema,
  questions_url: urlSchema,
});
export const settingsSchema = z.object({
  plan_name: z.string().trim().min(1).max(120),
  target: z.string().max(200),
  weekly_minutes: z.coerce.number().int().min(1).max(10080),
  default_minutes: z.coerce.number().int().min(1).max(480),
  theme: z.enum(["dark", "light"]),
  study_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  reminder_before: z.coerce.number().int().min(0).max(120),
  reminders: z.coerce.number().int().min(0).max(1),
  close_to_tray: z.coerce.number().int().min(0).max(1),
  completion_notice: z.coerce.number().int().min(0).max(1),
  review_days: z.string().refine((v) => {
    const d = v.split(",").map(Number);
    return (
      d.length > 0 &&
      d.length <= 10 &&
      d.every(
        (n, i) =>
          Number.isInteger(n) && n > 0 && n <= 365 && (i === 0 || n > d[i - 1]),
      )
    );
  }, "Informe até 10 dias crescentes, separados por vírgula."),
});
export const percent = (correct: number, total: number) =>
  total > 0 ? Math.round((correct / total) * 100) : 0;
export function netMs(intervals: Interval[], now = Date.now()) {
  return intervals.reduce(
    (n, i) =>
      n +
      Math.max(
        0,
        Date.parse(
          i.ended_at ?? i.checkpoint_at ?? new Date(now).toISOString(),
        ) - Date.parse(i.started_at),
      ),
    0,
  );
}
export function seconds(data: Pick<Data, "intervals">, session: Session) {
  return Math.floor(
    netMs(data.intervals.filter((i) => i.session_id === session.id)) / 1000,
  );
}
export function nextCycle(
  items: CycleItem[],
  cursor: number,
  activeIds?: string[],
) {
  const sorted = items
    .filter(
      (i) => !i.paused && (!activeIds || activeIds.includes(i.discipline_id)),
    )
    .sort((a, b) => a.position - b.position);
  return sorted.find((i) => i.position >= cursor) ?? sorted[0];
}
export function weekBounds(now = new Date()) {
  return {
    start: startOfWeek(now, { weekStartsOn: 1 }),
    end: endOfWeek(now, { weekStartsOn: 1 }),
  };
}
export function rangeMs(data: Data, start: Date, end: Date, discipline = "") {
  const ids = new Set(
    data.sessions
      .filter(
        (s) =>
          s.state === "completed" &&
          (!discipline || s.discipline_id === discipline),
      )
      .map((s) => s.id),
  );
  return data.intervals
    .filter((i) => ids.has(i.session_id))
    .reduce(
      (n, i) =>
        n +
        Math.max(
          0,
          Math.min(Date.parse(i.ended_at ?? i.checkpoint_at), end.getTime()) -
            Math.max(Date.parse(i.started_at), start.getTime()),
        ),
      0,
    );
}
export function nextReview(date: Date, days: number[], stage: number) {
  return stage < days.length
    ? addDays(
        date,
        stage === 0 ? days[0] : days[stage] - days[stage - 1],
      ).toISOString()
    : null;
}
export const timeLabel = (s: number) =>
  `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
export const hours = (ms: number) =>
  `${(ms / 3600000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
export const localDate = () => format(new Date(), "yyyy-MM-dd");
