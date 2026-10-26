import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useApp, repository } from "../../app/store";
import { Button } from "../../components/ui/button";
import {
  Editor,
  Confirm,
  Empty,
  type Values,
  type Field,
} from "../../components/forms";
import { localDate, percent } from "../../lib/domain";
export function Questions() {
  const d = useApp((s) => s.data)!;
  const [tab, setTab] = useState<"questions" | "errors">("questions");
  const [filter, setFilter] = useState(""),
    [topicFilter, setTopicFilter] = useState("");
  const [editor, setEditor] = useState<{ id?: string; initial: Values } | null>(
    null,
  );
  const [remove, setRemove] = useState<string | null>(null);
  const rows = d.questions.filter(
      (x) =>
        (!filter || x.discipline_id === filter) &&
        (!topicFilter || x.topic_id === topicFilter),
    ),
    errors = d.errors.filter(
      (x) =>
        (!filter || x.discipline_id === filter) &&
        (!topicFilter || x.topic_id === topicFilter),
    );
  const total = rows.reduce((n, q) => n + q.total, 0),
    correct = rows.reduce((n, q) => n + q.correct, 0);
  const fields = (v: Values): Field[] => [
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
      key: "topic_id",
      label: "Assunto",
      type: "select",
      options: [
        { value: "", label: "Sem assunto" },
        ...d.topics
          .filter((t) => t.discipline_id === v.discipline_id)
          .map((x) => ({ value: x.id, label: x.name })),
      ],
    },
    ...(tab === "questions"
      ? ([
          {
            key: "total",
            label: "Quantidade de questões",
            type: "number",
            min: 1,
            max: 100000,
          },
          {
            key: "correct",
            label: "Acertos",
            type: "number",
            min: 0,
            max: Number(v.total),
          },
          { key: "date", label: "Data", type: "date", required: true },
          { key: "board", label: "Banca (opcional)" },
          { key: "notes", label: "Observações", type: "textarea" },
        ] as Field[])
      : ([
          {
            key: "description",
            label: "Descrição do erro",
            type: "textarea",
            required: true,
          },
          { key: "explanation", label: "Explicação correta", type: "textarea" },
          { key: "source", label: "Fonte (opcional)" },
          { key: "reviewed", label: "Erro revisado", type: "checkbox" },
        ] as Field[])),
  ];
  return (
    <>
      <div className="page-title">
        <div>
          <h1>Questões e aprendizado</h1>
          <p className="muted">
            Identifique o que já evoluiu e o que merece atenção.
          </p>
        </div>
        <Button
          onClick={() =>
            setEditor({
              initial:
                tab === "questions"
                  ? {
                      discipline_id: filter,
                      topic_id: null,
                      total: 10,
                      correct: 0,
                      date: localDate(),
                      board: "",
                      notes: "",
                    }
                  : {
                      discipline_id: filter,
                      topic_id: null,
                      description: "",
                      explanation: "",
                      source: "",
                      reviewed: 0,
                    },
            })
          }
        >
          <Plus size={16} />
          {tab === "questions" ? "Registrar questões" : "Registrar erro"}
        </Button>
      </div>
      <div className="row tabs">
        <Button
          variant={tab === "questions" ? "default" : "ghost"}
          onClick={() => setTab("questions")}
        >
          Questões
        </Button>
        <Button
          variant={tab === "errors" ? "default" : "ghost"}
          onClick={() => setTab("errors")}
        >
          Caderno de erros
        </Button>
        <select
          aria-label="Filtrar por disciplina"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setTopicFilter("");
          }}
        >
          <option value="">Todas as disciplinas</option>
          {d.disciplines.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrar por assunto"
          value={topicFilter}
          onChange={(e) => setTopicFilter(e.target.value)}
        >
          <option value="">Todos os assuntos</option>
          {d.topics
            .filter((x) => !filter || x.discipline_id === filter)
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
        </select>
      </div>
      {tab === "questions" ? (
        <>
          <div className="stats three">
            <section className="card stat">
              <span>Questões resolvidas</span>
              <strong>{total}</strong>
            </section>
            <section className="card stat">
              <span>Acertos</span>
              <strong>{correct}</strong>
            </section>
            <section className="card stat">
              <span>Desempenho</span>
              <strong>{total ? percent(correct, total) + "%" : "—"}</strong>
            </section>
          </div>
          <section className="card table-wrap">
            {rows.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Disciplina / assunto</th>
                    <th>Data</th>
                    <th>Total</th>
                    <th>Acertos</th>
                    <th>Erros</th>
                    <th>%</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((q) => (
                    <tr key={q.id}>
                      <td>
                        {
                          d.disciplines.find((x) => x.id === q.discipline_id)
                            ?.name
                        }
                        <small>
                          {d.topics.find((t) => t.id === q.topic_id)?.name ??
                            q.board}
                        </small>
                        {q.notes && (
                          <small className="preserve">{q.notes}</small>
                        )}
                      </td>
                      <td>{q.date.split("-").reverse().join("/")}</td>
                      <td>{q.total}</td>
                      <td>{q.correct}</td>
                      <td>{q.errors}</td>
                      <td>{percent(q.correct, q.total)}%</td>
                      <td>
                        <div className="row">
                          <Button
                            variant="ghost"
                            aria-label="Editar registro"
                            onClick={() =>
                              setEditor({ id: q.id, initial: { ...q } })
                            }
                          >
                            <Pencil size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            aria-label="Excluir registro"
                            onClick={() => setRemove(q.id)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty title="Seu primeiro registro de questões">
                Anote o total e os acertos após uma lista de exercícios.
              </Empty>
            )}
          </section>
        </>
      ) : (
        <section className="card">
          {errors.length ? (
            errors.map((x) => (
              <article className="topic" key={x.id}>
                <div className="row between">
                  <span className="eyebrow">
                    {d.disciplines.find((s) => s.id === x.discipline_id)?.name}{" "}
                    · {new Date(x.created_at).toLocaleDateString("pt-BR")}
                  </span>
                  <span className="badge">
                    {x.reviewed ? "Revisado" : "Revisão pendente"}
                  </span>
                </div>
                <p className="muted small">
                  {d.topics.find((t) => t.id === x.topic_id)?.name}
                </p>
                <h3 className="preserve">{x.description}</h3>
                <p className="preserve">{x.explanation}</p>
                {x.source && <p className="muted small">Fonte: {x.source}</p>}
                <div className="row">
                  <Button
                    variant="outline"
                    onClick={() => setEditor({ id: x.id, initial: { ...x } })}
                  >
                    <Pencil size={14} />
                    Editar / revisar
                  </Button>
                  <Button variant="ghost" onClick={() => setRemove(x.id)}>
                    <Trash2 size={14} />
                    Excluir
                  </Button>
                </div>
              </article>
            ))
          ) : (
            <Empty title="Transforme erros em próximos passos">
              Registre uma explicação breve. Não é necessário transcrever a
              questão.
            </Empty>
          )}
        </section>
      )}
      {editor && (
        <Editor
          title={
            tab === "questions" ? "Registro de questões" : "Caderno de erros"
          }
          fields={fields}
          initial={editor.initial}
          onSave={(v) =>
            tab === "questions"
              ? repository.questions(
                  { ...v, topic_id: v.topic_id || null },
                  editor.id,
                )
              : repository.error(
                  { ...v, topic_id: v.topic_id || null },
                  editor.id,
                )
          }
          onClose={() => setEditor(null)}
        />
      )}{" "}
      {remove && (
        <Confirm
          title="Excluir registro?"
          description="Esta ação remove o registro selecionado."
          onConfirm={() =>
            repository.remove(
              tab === "questions" ? "question_records" : "error_notes",
              remove,
            )
          }
          onClose={() => setRemove(null)}
        />
      )}
    </>
  );
}
