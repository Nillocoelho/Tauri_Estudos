import { useEffect, useState } from "react";
import { Play, Pause, Square, ExternalLink, Clock3 } from "lucide-react";
import { useApp, repository, errorMessage } from "../../app/store";
import { nextCycle, seconds, timeLabel } from "../../lib/domain";
import { Button } from "../../components/ui/button";
import { Confirm } from "../../components/forms";
import { openMaterial } from "../../services/native";
export function Study() {
  const d = useApp((s) => s.data)!,
    run = useApp((s) => s.run),
    busy = useApp((s) => s.busy);
  const active = d.sessions.find((s) => s.state !== "completed");
  const next = nextCycle(
    d.cycle,
    d.cursor,
    d.disciplines.filter((x) => x.active).map((x) => x.id),
  );
  const [discipline, setDiscipline] = useState(
    next?.discipline_id ?? d.disciplines.find((x) => x.active)?.id ?? "",
  );
  const suggestedTopic = d.topics.find(
    (t) => t.discipline_id === next?.discipline_id && t.status !== "Estudado",
  );
  const [topic, setTopic] = useState(suggestedTopic?.id ?? "");
  const [minutes, setMinutes] = useState(
    next?.minutes ?? d.settings.default_minutes,
  );
  const [notes, setNotes] = useState(active?.notes ?? "");
  const [adjustment, setAdjustment] = useState(0);
  const [discard, setDiscard] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!active) {
      setDiscipline(
        next?.discipline_id ?? d.disciplines.find((x) => x.active)?.id ?? "",
      );
      setTopic(suggestedTopic?.id ?? "");
      setMinutes(next?.minutes ?? d.settings.default_minutes);
      setNotes("");
    }
  }, [active?.id, next?.id]);
  useEffect(() => {
    if (!active || notes === active.notes) return;
    const timeout = setTimeout(() => {
      void repository
        .notes(active.id, notes)
        .catch((e) => useApp.setState({ error: errorMessage(e) }));
    }, 700);
    return () => clearTimeout(timeout);
  }, [notes, active?.id]);
  useEffect(() => {
    const interval = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(interval);
  }, []);
  const topics = d.topics.filter(
    (t) => t.discipline_id === (active?.discipline_id ?? discipline),
  );
  const material = topics.find((t) => t.id === (active?.topic_id ?? topic));
  const base = active ? seconds(d, active) : 0;
  const open = d.intervals.find(
    (i) => i.session_id === active?.id && !i.ended_at,
  );
  const elapsed =
    base +
    (active?.state === "running" && open
      ? Math.floor(
          Math.max(
            0,
            Math.min(3000, Date.now() - Date.parse(open.checkpoint_at)),
          ) / 1000,
        )
      : 0);
  const planned = (active?.planned_minutes ?? minutes) * 60;
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.code === "Space" && e.ctrlKey) {
        e.preventDefault();
        if (active?.state === "running")
          void run(() => repository.pause(active.id));
        else if (active?.state === "paused")
          void run(() => repository.resume(active.id));
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [active, run]);
  return (
    <>
      <div className="page-title">
        <div>
          <p className="eyebrow">PRESENÇA, UM BLOCO DE CADA VEZ</p>
          <h1>Hora de estudar</h1>
          <p className="muted">
            Deixe o celular longe. Você só precisa começar.
          </p>
        </div>
        <span className="badge">
          <Clock3 size={14} /> Ctrl + Espaço para pausar
        </span>
      </div>
      <div className="study-grid">
        <section className="card timer-card">
          <span className="eyebrow">
            {active
              ? d.disciplines.find((x) => x.id === active.discipline_id)?.name
              : "SUA PRÓXIMA SESSÃO"}
          </span>
          <h3>
            {active?.topic_id
              ? topics.find((t) => t.id === active.topic_id)?.name
              : "Concentre-se no próximo passo"}
          </h3>
          <div className="timer" aria-live="off">
            {timeLabel(elapsed)}
          </div>
          <p className="muted">
            {active?.state === "recovery"
              ? "Sessão interrompida · confirme o tempo"
              : active?.state === "paused"
                ? "Sessão pausada"
                : active
                  ? "Tempo líquido de estudo"
                  : "Pronto quando você estiver"}{" "}
            · {Math.round(planned / 60)} min planejados
          </p>
          <progress max={planned} value={Math.min(elapsed, planned)} />
          {elapsed >= planned && active && (
            <p className="notice">
              Duração planejada concluída. Finalize quando estiver pronto.
            </p>
          )}
          {active?.state === "recovery" ? (
            <div className="recovery">
              <h3>Vamos recuperar sua sessão</h3>
              <p>
                O tempo até o último checkpoint foi preservado. O período
                posterior não foi contabilizado. Se você estudou durante parte
                dele, informe os minutos confirmados.
              </p>
              <label>
                Minutos adicionais confirmados
                <input
                  type="number"
                  min={0}
                  max={480}
                  value={adjustment}
                  onChange={(e) => setAdjustment(e.target.valueAsNumber)}
                />
              </label>
              <Button
                disabled={busy}
                onClick={() =>
                  run(() => repository.recover(active.id, adjustment))
                }
              >
                Confirmar tempo e manter pausada
              </Button>
            </div>
          ) : (
            <div className="row center timer-actions">
              {!active ? (
                <Button
                  disabled={busy || !discipline}
                  onClick={() =>
                    run(() =>
                      repository.start(
                        discipline,
                        topic || null,
                        minutes,
                        next?.discipline_id === discipline ? next.id : null,
                        notes,
                      ),
                    )
                  }
                >
                  <Play size={18} />
                  Iniciar estudo
                </Button>
              ) : (
                <>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        active.state === "running"
                          ? repository.pause(active.id)
                          : repository.resume(active.id),
                      )
                    }
                  >
                    {active.state === "running" ? (
                      <Pause size={18} />
                    ) : (
                      <Play size={18} />
                    )}{" "}
                    {active.state === "running" ? "Pausar" : "Retomar"}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      run(() => repository.finish(active.id, notes))
                    }
                  >
                    <Square size={15} />
                    Finalizar sessão
                  </Button>
                </>
              )}
            </div>
          )}
          {active && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setDiscard(true)}
            >
              Descartar sessão
            </Button>
          )}
          <p className="muted small">Uma pausa não é um retrocesso.</p>
        </section>
        <section className="card session-settings">
          <h3>Organize esta sessão</h3>
          <label>
            Disciplina
            <select
              disabled={!!active}
              value={active?.discipline_id ?? discipline}
              onChange={(e) => {
                setDiscipline(e.target.value);
                setTopic("");
              }}
            >
              <option value="">Selecione</option>
              {d.disciplines
                .filter((x) => x.active || x.id === active?.discipline_id)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Assunto
            <select
              disabled={!!active}
              value={active?.topic_id ?? topic}
              onChange={(e) => setTopic(e.target.value)}
            >
              <option value="">Estudo geral da disciplina</option>
              {topics.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Duração planejada
            <div className="row presets">
              {[25, 50, 60].map((v) => (
                <Button
                  key={v}
                  variant={minutes === v ? "default" : "outline"}
                  disabled={!!active}
                  onClick={() => setMinutes(v)}
                >
                  {v} min
                </Button>
              ))}
            </div>
            <input
              aria-label="Duração personalizada em minutos"
              type="number"
              min={1}
              max={480}
              disabled={!!active}
              value={active?.planned_minutes ?? minutes}
              onChange={(e) => setMinutes(e.target.valueAsNumber)}
            />
          </label>
          <label>
            Observações
            <textarea
              maxLength={10000}
              placeholder="Uma ideia, uma dificuldade, o próximo passo…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          {material && (
            <div className="column">
              {[
                ["Aula", material.lesson_url],
                ["PDF", material.pdf_url],
                ["Questões", material.questions_url],
              ]
                .filter(([, url]) => url)
                .map(([label, url]) => (
                  <Button
                    key={label}
                    variant="outline"
                    onClick={() => openMaterial(url)}
                  >
                    <ExternalLink size={15} />
                    Abrir {label.toLowerCase()}
                  </Button>
                ))}
            </div>
          )}
        </section>
      </div>
      {discard && active && (
        <Confirm
          title="Descartar sessão?"
          description="O tempo desta sessão será removido e o ciclo permanecerá na mesma posição."
          onConfirm={() => repository.discard(active.id)}
          onClose={() => setDiscard(false)}
        />
      )}
    </>
  );
}
