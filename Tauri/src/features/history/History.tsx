import { useState } from "react";
import { format, subDays, startOfDay, endOfDay, subWeeks } from "date-fns";
import { useApp } from "../../app/store";
import { hours, rangeMs, percent, seconds, weekBounds } from "../../lib/domain";
import { Empty } from "../../components/forms";
export function History() {
  const d = useApp((s) => s.data)!;
  const [range, setRange] = useState("7"),
    [discipline, setDiscipline] = useState(""),
    [from, setFrom] = useState(format(subDays(new Date(), 6), "yyyy-MM-dd")),
    [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const start =
    range === "custom"
      ? startOfDay(new Date(from + "T12:00:00"))
      : startOfDay(subDays(new Date(), Number(range) - 1));
  const end =
    range === "custom"
      ? endOfDay(new Date(to + "T12:00:00"))
      : endOfDay(new Date());
  const valid = !isNaN(+start) && !isNaN(+end) && start <= end;
  const records = d.sessions.filter(
    (s) =>
      s.state === "completed" &&
      s.ended_at &&
      new Date(s.ended_at) >= start &&
      new Date(s.started_at) <= end &&
      (!discipline || s.discipline_id === discipline),
  );
  const q = d.questions.filter(
    (q) =>
      (!discipline || q.discipline_id === discipline) &&
      q.date >= format(start, "yyyy-MM-dd") &&
      q.date <= format(end, "yyyy-MM-dd"),
  );
  const total = q.reduce((n, q) => n + q.total, 0),
    correct = q.reduce((n, q) => n + q.correct, 0);
  const thisWeek = weekBounds(),
    lastWeek = weekBounds(subWeeks(new Date(), 1));
  const thisMs = rangeMs(d, thisWeek.start, thisWeek.end),
    lastMs = rangeMs(d, lastWeek.start, lastWeek.end);
  const accuracy = (s: Date, e: Date) => {
    const rows = d.questions.filter(
      (q) =>
        q.date >= format(s, "yyyy-MM-dd") && q.date <= format(e, "yyyy-MM-dd"),
    );
    const total = rows.reduce((n, q) => n + q.total, 0);
    return total
      ? percent(
          rows.reduce((n, q) => n + q.correct, 0),
          total,
        )
      : null;
  };
  const currentAccuracy = accuracy(thisWeek.start, thisWeek.end),
    previousAccuracy = accuracy(lastWeek.start, lastWeek.end);
  const weak = d.disciplines.filter((x) => {
    const rows = d.questions.filter(
      (q) =>
        q.discipline_id === x.id &&
        q.date >= format(thisWeek.start, "yyyy-MM-dd") &&
        q.date <= format(thisWeek.end, "yyyy-MM-dd"),
    );
    return (
      rows.length &&
      percent(
        rows.reduce((n, q) => n + q.correct, 0),
        rows.reduce((n, q) => n + q.total, 0),
      ) < 60
    );
  });
  return (
    <>
      <div className="page-title">
        <div>
          <h1>Histórico e relatórios</h1>
          <p className="muted">
            Reconheça o caminho percorrido e escolha seus próximos passos.
          </p>
        </div>
      </div>
      <section className="card filters">
        <label>
          Período
          <select value={range} onChange={(e) => setRange(e.target.value)}>
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
            <option value="custom">Personalizado</option>
          </select>
        </label>
        <label>
          Disciplina
          <select
            value={discipline}
            onChange={(e) => setDiscipline(e.target.value)}
          >
            <option value="">Todas</option>
            {d.disciplines.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        {range === "custom" && (
          <>
            <label>
              De
              <input
                type="date"
                required
                value={from}
                onChange={(e) => {
                  if (e.target.value) setFrom(e.target.value);
                }}
              />
            </label>
            <label>
              Até
              <input
                type="date"
                required
                value={to}
                onChange={(e) => {
                  if (e.target.value) setTo(e.target.value);
                }}
              />
            </label>
          </>
        )}
      </section>
      {!valid && <p role="alert">Informe um período válido.</p>}
      <div className="stats three">
        <section className="card stat">
          <span>Horas líquidas no período</span>
          <strong>
            {valid ? hours(rangeMs(d, start, end, discipline)) : "—"}
          </strong>
        </section>
        <section className="card stat">
          <span>Questões no período</span>
          <strong>{total}</strong>
        </section>
        <section className="card stat">
          <span>Percentual de acertos</span>
          <strong>{total ? percent(correct, total) + "%" : "—"}</strong>
        </section>
      </div>
      <section className="card">
        <h3>Resumo desta semana · todas as disciplinas</h3>
        <div className="summary-grid">
          <div>
            <span className="muted small">Planejado / realizado</span>
            <p>
              {hours(d.settings.weekly_minutes * 60000)} / {hours(thisMs)}
            </p>
          </div>
          <div>
            <span className="muted small">Semana anterior</span>
            <p>
              {hours(lastMs)} · Diferença {hours(thisMs - lastMs)}
            </p>
          </div>
          <div>
            <span className="muted small">Acertos nesta / semana anterior</span>
            <p>
              {currentAccuracy === null
                ? "Sem registros"
                : currentAccuracy + "%"}{" "}
              /{" "}
              {previousAccuracy === null
                ? "Sem registros"
                : previousAccuracy + "%"}
              {currentAccuracy !== null && previousAccuracy !== null
                ? ` · ${currentAccuracy - previousAccuracy} p.p.`
                : ""}
            </p>
          </div>
          <div>
            <span className="muted small">Questões respondidas</span>
            <p>
              {d.questions
                .filter(
                  (q) =>
                    q.date >= format(thisWeek.start, "yyyy-MM-dd") &&
                    q.date <= format(thisWeek.end, "yyyy-MM-dd"),
                )
                .reduce((n, q) => n + q.total, 0)}
            </p>
          </div>
        </div>
        <p className="muted small">
          Disciplinas estudadas:{" "}
          {d.disciplines
            .filter((x) => rangeMs(d, thisWeek.start, thisWeek.end, x.id) > 0)
            .map((x) => x.name)
            .join(", ") || "nenhuma sessão concluída ainda"}
          .
        </p>
        <p className="muted small">
          Pontos de atenção:{" "}
          {weak.length
            ? `${weak.map((x) => x.name).join(", ")} tiveram menos de 60% de acertos nos registros desta semana; confira os erros antes de tirar conclusões.`
            : "registre questões e dificuldades para orientar suas próximas revisões."}
        </p>
      </section>
      <section className="card table-wrap">
        <h3>Sessões concluídas</h3>
        {records.length ? (
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Disciplina / assunto</th>
                <th>Planejado</th>
                <th>Tempo líquido total</th>
              </tr>
            </thead>
            <tbody>
              {records.map((s) => (
                <tr key={s.id}>
                  <td>{new Date(s.started_at).toLocaleString("pt-BR")}</td>
                  <td>
                    {d.disciplines.find((x) => x.id === s.discipline_id)?.name}
                    <small>
                      {d.topics.find((t) => t.id === s.topic_id)?.name}
                    </small>
                    {s.notes && <small className="preserve">{s.notes}</small>}
                  </td>
                  <td>{s.planned_minutes} min</td>
                  <td>{hours(seconds(d, s) * 1000)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty title="Nenhuma sessão neste período" />
        )}
      </section>
    </>
  );
}
