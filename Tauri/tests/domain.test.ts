import { describe, it, expect } from "vitest";
import {
  netMs,
  nextCycle,
  percent,
  questionSchema,
  urlSchema,
  nextReview,
  weekBounds,
  rangeMs,
} from "../src/lib/domain";
import type { Interval, CycleItem, Data } from "../src/types";
describe("tempo e recuperação", () => {
  it("soma intervalos comprovados, sem somar pausas ou tempo após o checkpoint", () => {
    const values: Interval[] = [
      {
        id: "1",
        session_id: "a",
        started_at: "2026-10-20T19:00:00Z",
        checkpoint_at: "2026-10-20T19:25:00Z",
        ended_at: "2026-10-20T19:25:00Z",
      },
      {
        id: "2",
        session_id: "a",
        started_at: "2026-10-20T19:40:00Z",
        checkpoint_at: "2026-10-20T19:50:00Z",
        ended_at: null,
      },
    ];
    expect(netMs(values, Date.parse("2026-10-21T10:00:00Z"))).toBe(35 * 60000);
  });
  it("não produz duração negativa", () =>
    expect(
      netMs([
        {
          id: "1",
          session_id: "a",
          started_at: "2026-10-20T20:00:00Z",
          checkpoint_at: "2026-10-20T19:00:00Z",
          ended_at: null,
        },
      ]),
    ).toBe(0));
});
describe("ciclo", () => {
  const item = (position: number, paused = 0) =>
    ({
      id: String(position),
      position,
      paused,
      discipline_id: "d",
      minutes: 60,
      priority: 1,
      cycle_id: "main",
    }) as CycleItem;
  it("preserva posição independentemente do dia e ignora pausados", () => {
    expect(nextCycle([item(0), item(1, 1), item(2)], 1)?.position).toBe(2);
    expect(nextCycle([item(0), item(1)], 2)?.position).toBe(0);
  });
  it("trata ciclo vazio", () => expect(nextCycle([], 0)).toBeUndefined());
});
describe("validação de desempenho", () => {
  const base = {
    discipline_id: "d",
    topic_id: null,
    total: 10,
    correct: 7,
    date: "2026-10-20",
    board: "",
    notes: "",
  };
  it("rejeita negativos, acertos excessivos e datas impossíveis", () => {
    expect(questionSchema.safeParse({ ...base, correct: 11 }).success).toBe(
      false,
    );
    expect(questionSchema.safeParse({ ...base, total: -1 }).success).toBe(
      false,
    );
    expect(
      questionSchema.safeParse({ ...base, date: "2026-02-31" }).success,
    ).toBe(false);
    expect(questionSchema.safeParse(base).success).toBe(true);
  });
  it("calcula percentual ponderado e vazio", () => {
    expect(percent(7, 10)).toBe(70);
    expect(percent(0, 0)).toBe(0);
  });
  it("valida URLs antes de abrir materiais", () => {
    for (const bad of [
      "javascript:alert(1)",
      "file:///C:/Windows",
      "https://a:b@example.com",
      "inválido",
    ])
      expect(urlSchema.safeParse(bad).success).toBe(false);
    expect(
      urlSchema.safeParse("https://www.grancursosonline.com.br/").success,
    ).toBe(true);
  });
});
describe("semana local e revisões", () => {
  it("segunda a domingo local", () => {
    const bounds = weekBounds(new Date(2026, 9, 25, 12));
    expect(bounds.start.getDay()).toBe(1);
    expect(bounds.end.getDay()).toBe(0);
    expect(bounds.start.getHours()).toBe(0);
  });
  it("agendamento determinístico com intervalos relativos", () => {
    const date = new Date(2026, 9, 20, 19);
    expect(new Date(nextReview(date, [1, 7, 30], 0)!).getDate()).toBe(21);
    expect(new Date(nextReview(date, [1, 7, 30], 1)!).getDate()).toBe(26);
    expect(nextReview(date, [1, 7, 30], 3)).toBeNull();
  });
  it("divide sessão atravessando a semana sem inventar horas", () => {
    const start = new Date(2026, 9, 26, 0),
      end = new Date(2026, 9, 26, 1);
    const data = {
      sessions: [{ id: "s", state: "completed", discipline_id: "d" }],
      intervals: [
        {
          session_id: "s",
          started_at: new Date(2026, 9, 25, 23, 30).toISOString(),
          checkpoint_at: new Date(2026, 9, 26, 0, 30).toISOString(),
          ended_at: new Date(2026, 9, 26, 0, 30).toISOString(),
        },
      ],
    } as Data;
    expect(rangeMs(data, start, end)).toBe(30 * 60000);
  });
});
