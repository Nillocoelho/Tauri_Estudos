import { useState } from "react";
import {
  Plus,
  ArrowUp,
  ArrowDown,
  Pencil,
  Trash2,
  ArrowRight,
} from "lucide-react";
import { useApp, repository } from "../../app/store";
import { Button } from "../../components/ui/button";
import {
  Editor,
  Confirm,
  Empty,
  type Values,
  type Field,
} from "../../components/forms";
import { nextCycle } from "../../lib/domain";
export function Cycle() {
  const d = useApp((s) => s.data)!,
    run = useApp((s) => s.run),
    busy = useApp((s) => s.busy);
  const [editor, setEditor] = useState<{ id?: string; initial: Values } | null>(
    null,
  );
  const [remove, setRemove] = useState<string | null>(null);
  const next = nextCycle(
    d.cycle,
    d.cursor,
    d.disciplines.filter((x) => x.active).map((x) => x.id),
  );
  const fields: Field[] = [
    {
      key: "discipline_id",
      label: "Disciplina",
      type: "select",
      required: true,
      options: [
        { value: "", label: "Selecione" },
        ...d.disciplines.map((x) => ({ value: x.id, label: x.name })),
      ],
    },
    {
      key: "minutes",
      label: "Duração em minutos",
      type: "number",
      min: 1,
      max: 480,
    },
    {
      key: "priority",
      label: "Prioridade (informativa, 1 a 5)",
      type: "number",
      min: 1,
      max: 5,
    },
    { key: "paused", label: "Pausar item", type: "checkbox" },
  ];
  return (
    <>
      <div className="page-title">
        <div>
          <h1>Ciclo de estudos</h1>
          <p className="muted">
            Sem dívida de horas. Retome exatamente de onde parou.
          </p>
        </div>
        <Button
          onClick={() =>
            setEditor({
              initial: {
                discipline_id: "",
                minutes: d.settings.default_minutes,
                priority: 2,
                paused: 0,
                position: d.cycle.length
                  ? Math.max(...d.cycle.map((i) => i.position)) + 1
                  : 0,
              },
            })
          }
        >
          <Plus size={16} />
          Adicionar disciplina
        </Button>
      </div>
      <div className="notice">
        A ordem é definida por você. Prioridades ajudam na organização, sem
        alterar automaticamente o ciclo.
      </div>
      <section className="card cycle-list">
        {d.cycle.map((item, i) => {
          const x = d.disciplines.find((x) => x.id === item.discipline_id);
          return (
            <article
              className={`cycle-row ${next?.id === item.id ? "current" : ""}`}
              key={item.id}
            >
              <span className="cycle-number">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="grow">
                <h3>{x?.name}</h3>
                <p className="muted small">
                  {item.minutes} min · Prioridade {item.priority} ·{" "}
                  {item.paused || !x?.active ? "Pausada" : "Ativa"}
                </p>
              </div>
              {next?.id === item.id && (
                <span className="badge accent">Próxima sessão</span>
              )}
              <div className="row actions">
                <Button
                  variant="ghost"
                  disabled={busy || i === 0}
                  aria-label="Mover para cima"
                  onClick={() =>
                    run(() => repository.reorder(d.cycle, i, i - 1, next?.id))
                  }
                >
                  <ArrowUp size={15} />
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy || i === d.cycle.length - 1}
                  aria-label="Mover para baixo"
                  onClick={() =>
                    run(() => repository.reorder(d.cycle, i, i + 1, next?.id))
                  }
                >
                  <ArrowDown size={15} />
                </Button>
                <Button
                  variant="ghost"
                  aria-label="Editar item do ciclo"
                  onClick={() =>
                    setEditor({ id: item.id, initial: { ...item } })
                  }
                >
                  <Pencil size={15} />
                </Button>
                <Button
                  variant="ghost"
                  aria-label="Remover item do ciclo"
                  onClick={() => setRemove(item.id)}
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            </article>
          );
        })}
        {!d.cycle.length && (
          <Empty title="Monte seu ciclo">
            Adicione suas disciplinas na ordem em que deseja estudá-las.
          </Empty>
        )}
      </section>
      {next && (
        <Button
          variant="outline"
          disabled={busy || d.sessions.some((s) => s.state !== "completed")}
          onClick={() => run(() => repository.advance(next.position))}
        >
          Avançar manualmente para a próxima <ArrowRight size={16} />
        </Button>
      )}
      <p className="footnote">
        Concluir uma sessão iniciada pelo ciclo avança a sequência. Pausas e
        dias sem estudo preservam sua posição.
      </p>
      {editor && (
        <Editor
          title="Item do ciclo"
          fields={fields}
          initial={editor.initial}
          onSave={(v) => repository.cycle(v, editor.id)}
          onClose={() => setEditor(null)}
        />
      )}{" "}
      {remove && (
        <Confirm
          title="Remover do ciclo?"
          description="O histórico de estudos da disciplina será preservado."
          onConfirm={() => repository.remove("cycle_items", remove)}
          onClose={() => setRemove(null)}
        />
      )}
    </>
  );
}
