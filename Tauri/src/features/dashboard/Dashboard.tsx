import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Play,
  Target,
  Clock3,
  CheckCheck,
  BookOpen,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";
import { addDays, startOfDay, endOfDay, format, subWeeks } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useApp } from "../../app/store";
import {
  nextCycle,
  rangeMs,
  weekBounds,
  hours,
  percent,
} from "../../lib/domain";
import { Button } from "../../components/ui/button";
import { Empty } from "../../components/forms";
import { openMaterial } from "../../services/native";
export function Dashboard() {
  const d = useApp((s) => s.data)!;
  const { start, end } = weekBounds();
  const studied = rangeMs(d, start, end);
  const q = d.questions.filter(
    (q) =>
      q.date >= format(start, "yyyy-MM-dd") &&
      q.date <= format(end, "yyyy-MM-dd"),
  );
  const total = q.reduce((n, q) => n + q.total, 0),
    correct = q.reduce((n, q) => n + q.correct, 0);
  const next = nextCycle(
    d.cycle,
    d.cursor,
    d.disciplines.filter((x) => x.active).map((x) => x.id),
  );
  const discipline = d.disciplines.find((x) => x.id === next?.discipline_id);
  const topic = d.topics.find(
    (t) => t.discipline_id === discipline?.id && t.status !== "Estudado",
  );
  const active = d.sessions.find((s) => s.state !== "completed");
  const daily = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(startOfDay(new Date()), i - 6);
    return {
      day: format(date, "EEE", { locale: ptBR }),
      hours:
        Math.round(rangeMs(d, startOfDay(date), endOfDay(date)) / 36000) / 100,
    };
  });
  const distribution = d.disciplines
    .map((x) => ({
      name: x.name,
      hours: Math.round(rangeMs(d, start, end, x.id) / 36000) / 100,
    }))
    .filter((x) => x.hours > 0);
  const evolution = Array.from({ length: 4 }, (_, i) => {
    const date = subWeeks(new Date(), 3 - i);
    const b = weekBounds(date);
    const row: Record<string, string | number | null> = {
      week: format(b.start, "dd/MM"),
    };
    d.disciplines.forEach((x) => {
      const rows = d.questions.filter(
        (q) =>
          q.discipline_id === x.id &&
          q.date >= format(b.start, "yyyy-MM-dd") &&
          q.date <= format(b.end, "yyyy-MM-dd"),
      );
      row[x.id] = rows.length
        ? percent(
            rows.reduce((n, q) => n + q.correct, 0),
            rows.reduce((n, q) => n + q.total, 0),
          )
        : null;
    });
    return row;
  });
  return (
    <>
      <div className="page-title">
        <div>
          <p className="eyebrow">UM PASSO DE CADA VEZ</p>
          <h1>Seu caminho até a aprovação</h1>
          <p className="muted">
            {format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}. Vamos
            cuidar do próximo passo.
          </p>
        </div>
        <span className="badge">
          <span className="dot" /> Tudo salvo neste computador
        </span>
      </div>
      <section className="next-card">
        <div>
          <span className="eyebrow">
            {active ? "SESSÃO EM ANDAMENTO" : "O QUE ESTUDAR AGORA"}
          </span>
          <h2>
            {active
              ? d.disciplines.find((x) => x.id === active.discipline_id)?.name
              : (discipline?.name ?? "Prepare seu primeiro ciclo")}
          </h2>
          <p>
            {topic?.name ??
              (discipline
                ? "Escolha um assunto ou comece pela disciplina."
                : "Adicione disciplinas ao seu ciclo para receber a próxima sessão.")}
          </p>
          <div className="row">
            <span className="badge">
              <Clock3 size={14} />
              {active?.planned_minutes ??
                next?.minutes ??
                d.settings.default_minutes}{" "}
              minutos
            </span>
            <span className="muted small">{d.settings.target}</span>
          </div>
        </div>
        <div className="column">
          <Button asChild>
            <Link to={next || active ? "/estudar" : "/ciclo"}>
              <Play size={16} />
              {active
                ? "Retomar sessão"
                : next
                  ? "Iniciar estudo"
                  : "Configurar ciclo"}
            </Link>
          </Button>
          {topic && (topic.lesson_url || topic.pdf_url) && (
            <Button
              variant="ghost"
              onClick={() => openMaterial(topic.lesson_url || topic.pdf_url)}
            >
              Abrir material <ArrowUpRight size={15} />
            </Button>
          )}
        </div>
      </section>
      <div className="stats">
        {[
          {
            icon: Clock3,
            label: "Tempo líquido na semana",
            value: hours(studied),
            detail: `de ${d.settings.weekly_minutes / 60} h planejadas`,
          },
          {
            icon: Target,
            label: "Sua meta semanal",
            value: `${Math.round((studied / (d.settings.weekly_minutes * 60000)) * 100)}%`,
            detail: "Segunda a domingo, no seu ritmo",
          },
          {
            icon: CheckCheck,
            label: "Questões resolvidas",
            value: String(total),
            detail: total
              ? `${percent(correct, total)}% de acertos`
              : "Sem questões nesta semana",
          },
          {
            icon: BookOpen,
            label: "Sessões concluídas",
            value: String(
              d.sessions.filter(
                (s) =>
                  s.state === "completed" &&
                  s.ended_at &&
                  new Date(s.ended_at) >= start &&
                  new Date(s.ended_at) <= end,
              ).length,
            ),
            detail: "Cada sessão é um avanço",
          },
        ].map((s) => (
          <section className="card stat" key={s.label}>
            <div className="row between">
              <span>{s.label}</span>
              <s.icon size={17} />
            </div>
            <strong>{s.value}</strong>
            <p className="muted small">{s.detail}</p>
          </section>
        ))}
      </div>
      <div className="charts">
        <section className="card">
          <h3>Seu ritmo nos últimos 7 dias</h3>
          <p className="muted small">Horas líquidas de sessões concluídas</p>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" />
                <YAxis unit="h" width={35} />
                <Tooltip />
                <Bar
                  dataKey="hours"
                  name="Horas"
                  fill="#729df5"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="card">
          <h3>Tempo por disciplina</h3>
          <p className="muted small">Distribuição nesta semana</p>
          {distribution.length ? (
            <div className="distribution">
              {distribution.map((x) => (
                <div key={x.name}>
                  <div className="row between small">
                    <span>{x.name}</span>
                    <span>{x.hours} h</span>
                  </div>
                  <progress
                    max={Math.max(...distribution.map((x) => x.hours))}
                    value={x.hours}
                  />
                </div>
              ))}
            </div>
          ) : (
            <Empty title="Seu progresso começa aqui">
              Ao concluir uma sessão, você verá a distribuição do seu tempo.
            </Empty>
          )}
        </section>
      </div>
      <section className="card">
        <div className="row between">
          <div>
            <h3>Evolução dos acertos</h3>
            <p className="muted small">
              Percentual por disciplina nas últimas quatro semanas
            </p>
          </div>
          <Link className="text-link" to="/questoes">
            Registrar questões <ArrowUpRight size={14} />
          </Link>
        </div>
        {d.questions.length ? (
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={evolution}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" />
                <YAxis domain={[0, 100]} unit="%" />
                <Tooltip />
                <Legend />
                {d.disciplines
                  .filter((x) =>
                    d.questions.some((q) => q.discipline_id === x.id),
                  )
                  .map((x) => (
                    <Line
                      key={x.id}
                      dataKey={x.id}
                      name={x.name}
                      stroke={x.color}
                      connectNulls={false}
                    />
                  ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <Empty title="Ainda não há desempenho registrado">
            Registre suas questões para acompanhar a evolução, sem pressa.
          </Empty>
        )}
      </section>
      <p className="footnote">
        Consistência tem espaço para dias difíceis. Seu ciclo continua de onde
        você parou.
      </p>
    </>
  );
}
