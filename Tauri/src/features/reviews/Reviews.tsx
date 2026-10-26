import { useState } from "react";
import { Plus, Check, CalendarClock, Trash2 } from "lucide-react";
import { addDays, format, isBefore, startOfDay } from "date-fns";
import { useApp, repository } from "../../app/store";
import { Button } from "../../components/ui/button";
import {
  Editor,
  Confirm,
  Empty,
  type Values,
  type Field,
} from "../../components/forms";
export function Reviews() {
  const d = useApp((s) => s.data)!;
  const run = useApp((s) => s.run),
    busy = useApp((s) => s.busy);
  const [all, setAll] = useState(false);
  const [remove, setRemove] = useState<string | null>(null);
  const [editor, setEditor] = useState<{
    title: string;
    initial: Values;
    fields: Field[];
    save: (v: Values) => Promise<unknown>;
  } | null>(null);
  const days = d.settings.review_days.split(",").map(Number);
  const pending = d.reviews.filter((r) => r.state === "pending");
  const rows = d.reviews.filter((r) => all || r.state === "pending");
  return (
    <>
      <div className="page-title">
        <div>
          <h1>Revisões</h1>
          <p className="muted">
            Reencontre o conteúdo com intenção, sem acumular cobranças.
          </p>
        </div>
        <Button
          onClick={() =>
            setEditor({
              title: "Agendar revisão",
              initial: { topic_id: "" },
              fields: [
                {
                  key: "topic_id",
                  label: "Assunto",
                  type: "select",
                  required: true,
                  options: [
                    { value: "", label: "Selecione" },
                    ...d.topics
                      .filter((t) => !pending.some((r) => r.topic_id === t.id))
                      .map((t) => ({
                        value: t.id,
                        label: `${d.disciplines.find((x) => x.id === t.discipline_id)?.name} · ${t.name}`,
                      })),
                  ],
                },
              ],
              save: (v) => repository.schedule(String(v.topic_id), days),
            })
          }
        >
          <Plus size={16} />
          Agendar revisão
        </Button>
      </div>
      <div className="notice">
        Intervalos atuais: {days.join(", ")} dias. Revisões são criadas apenas
        quando você agenda um assunto. Concluir uma revisão não adiciona horas
        de estudo.
      </div>
      <div className="row between">
        <h3>{pending.length} revisões pendentes</h3>
        <label className="row">
          <input
            type="checkbox"
            checked={all}
            onChange={(e) => setAll(e.target.checked)}
          />
          Mostrar concluídas
        </label>
      </div>
      <section className="card">
        {rows.length ? (
          rows.map((r) => {
            const t = d.topics.find((t) => t.id === r.topic_id);
            return (
              <article key={r.id} className="cycle-row">
                <CalendarClock size={21} />
                <div className="grow">
                  <h3>{t?.name}</h3>
                  <p className="muted small">
                    {d.disciplines.find((x) => x.id === t?.discipline_id)?.name}{" "}
                    · Etapa {r.stage + 1} ·{" "}
                    {format(new Date(r.due_at), "dd/MM/yyyy")}
                  </p>
                </div>
                <span className="badge">
                  {r.state === "done"
                    ? `Concluída${r.performance !== null ? " · " + r.performance + "%" : ""}`
                    : isBefore(new Date(r.due_at), startOfDay(new Date()))
                      ? "Pendente"
                      : "Agendada"}
                </span>
                {r.state === "pending" && (
                  <div className="row actions">
                    <Button
                      variant="outline"
                      onClick={() =>
                        setEditor({
                          title: "Concluir revisão",
                          initial: { performance: null },
                          fields: [
                            {
                              key: "performance",
                              label: "Desempenho em % (opcional)",
                              type: "number",
                              min: 0,
                              max: 100,
                            },
                          ],
                          save: (v) =>
                            repository.completeReview(
                              r.id,
                              v.performance === null ||
                                v.performance === "" ||
                                Number.isNaN(v.performance)
                                ? null
                                : Number(v.performance),
                              days,
                            ),
                        })
                      }
                    >
                      <Check size={14} />
                      Concluir
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        run(() =>
                          repository.postpone(
                            r.id,
                            addDays(
                              new Date(r.due_at) > new Date()
                                ? new Date(r.due_at)
                                : new Date(),
                              1,
                            ).toISOString(),
                          ),
                        )
                      }
                    >
                      Adiar 1 dia
                    </Button>
                  </div>
                )}
                <Button
                  variant="ghost"
                  aria-label="Remover revisão"
                  onClick={() => setRemove(r.id)}
                >
                  <Trash2 size={14} />
                </Button>
              </article>
            );
          })
        ) : (
          <Empty title="Nenhuma revisão por aqui">
            Cadastre assuntos e agende apenas o que fizer sentido revisar.
          </Empty>
        )}
      </section>
      {editor && (
        <Editor
          title={editor.title}
          fields={editor.fields}
          initial={editor.initial}
          onSave={editor.save}
          onClose={() => setEditor(null)}
        />
      )}{" "}
      {remove && (
        <Confirm
          title="Remover revisão?"
          description="O assunto e as sessões serão preservados."
          onConfirm={() => repository.remove("reviews", remove)}
          onClose={() => setRemove(null)}
        />
      )}
    </>
  );
}
