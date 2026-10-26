import { useState } from "react";
import { Plus, Pencil, Trash2, ExternalLink } from "lucide-react";
import { useApp, repository } from "../../app/store";
import {
  Editor,
  Confirm,
  Empty,
  type Field,
  type Values,
} from "../../components/forms";
import { Button } from "../../components/ui/button";
import { rangeMs, hours, percent } from "../../lib/domain";
import { openMaterial } from "../../services/native";
const categories = [
  "Conhecimentos Gerais",
  "Tecnologia da Informação",
  "Direito",
  "Administração",
  "Outras",
];
const statuses = [
  "Não iniciado",
  "Em andamento",
  "Estudado",
  "Revisão necessária",
];
const options = (values: string[]) =>
  values.map((value) => ({ value, label: value }));
export function Disciplines() {
  const d = useApp((s) => s.data)!;
  const [selected, setSelected] = useState("");
  const [editor, setEditor] = useState<{
    type: "discipline" | "topic";
    id?: string;
    initial: Values;
  } | null>(null);
  const [deletion, setDeletion] = useState<{
    table: "disciplines" | "topics";
    id: string;
  } | null>(null);
  const [search, setSearch] = useState("");
  const current = d.disciplines.find((x) => x.id === selected);
  const topics = d.topics.filter((t) => t.discipline_id === selected);
  const disciplineFields: Field[] = [
    { key: "name", label: "Nome", required: true },
    {
      key: "category",
      label: "Categoria",
      type: "select",
      options: options(categories),
    },
    { key: "color", label: "Cor", type: "color" },
    {
      key: "priority",
      label: "Prioridade (1 a 5)",
      type: "number",
      min: 1,
      max: 5,
    },
    { key: "active", label: "Disciplina ativa", type: "checkbox" },
  ];
  const topicFields: Field[] = [
    { key: "name", label: "Assunto", required: true },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: options(statuses),
    },
    { key: "position", label: "Ordem", type: "number", min: 0 },
    { key: "lesson_url", label: "Link da aula (opcional)" },
    { key: "pdf_url", label: "Link do PDF (opcional)" },
    { key: "questions_url", label: "Link de questões (opcional)" },
    { key: "notes", label: "Observações", type: "textarea" },
  ];
  return (
    <>
      <div className="page-title">
        <div>
          <h1>Disciplinas e assuntos</h1>
          <p className="muted">
            Seu conteúdo organizado, com espaço para evoluir.
          </p>
        </div>
        <Button
          onClick={() =>
            setEditor({
              type: "discipline",
              initial: {
                name: "",
                category: categories[0],
                color: "#729df5",
                priority: 2,
                active: 1,
              },
            })
          }
        >
          <Plus size={16} />
          Nova disciplina
        </Button>
      </div>
      <input
        className="search"
        aria-label="Buscar disciplina"
        placeholder="Buscar disciplina…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="discipline-grid">
        <div className="column">
          {d.disciplines
            .filter((x) =>
              x.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
            )
            .map((x) => {
              const q = d.questions.filter((q) => q.discipline_id === x.id);
              const total = q.reduce((n, q) => n + q.total, 0);
              return (
                <section
                  key={x.id}
                  className={`card discipline-card ${selected === x.id ? "selected" : ""}`}
                >
                  <div className="row between">
                    <button
                      className="discipline-title"
                      onClick={() => setSelected(x.id)}
                    >
                      <span
                        className="color-dot"
                        style={{ background: x.color }}
                      />
                      {x.name}
                    </button>
                    <div className="row">
                      <Button
                        variant="ghost"
                        aria-label={`Editar ${x.name}`}
                        onClick={() =>
                          setEditor({
                            type: "discipline",
                            id: x.id,
                            initial: { ...x },
                          })
                        }
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        aria-label={`Excluir ${x.name}`}
                        onClick={() =>
                          setDeletion({ table: "disciplines", id: x.id })
                        }
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                  <p className="muted small">
                    {x.category} · Prioridade {x.priority} ·{" "}
                    {x.active ? "Ativa" : "Pausada"}
                  </p>
                  <div className="row small">
                    <span>
                      {hours(rangeMs(d, new Date(0), new Date(), x.id))}
                    </span>
                    <span>{total} questões</span>
                    <span>
                      {total
                        ? `${percent(
                            q.reduce((n, q) => n + q.correct, 0),
                            total,
                          )}% acertos`
                        : "Sem desempenho"}
                    </span>
                  </div>
                  <Button
                    className="mt"
                    variant="outline"
                    onClick={() => setSelected(x.id)}
                  >
                    Ver{" "}
                    {d.topics.filter((t) => t.discipline_id === x.id).length}{" "}
                    assuntos
                  </Button>
                </section>
              );
            })}
          {!d.disciplines.length && (
            <Empty title="Cadastre sua primeira disciplina" />
          )}
        </div>
        <section className="card">
          {current ? (
            <>
              <div className="row between">
                <div>
                  <h2>{current.name}</h2>
                  <p className="muted small">
                    Assistir uma aula não define domínio. Atualize o status no
                    seu ritmo.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() =>
                    setEditor({
                      type: "topic",
                      initial: {
                        discipline_id: selected,
                        name: "",
                        position: topics.length,
                        status: statuses[0],
                        lesson_url: "",
                        pdf_url: "",
                        questions_url: "",
                        notes: "",
                      },
                    })
                  }
                >
                  <Plus size={16} />
                  Assunto
                </Button>
              </div>
              {topics.length ? (
                topics.map((t) => {
                  const q = d.questions.filter((q) => q.topic_id === t.id);
                  const total = q.reduce((n, q) => n + q.total, 0);
                  return (
                    <article className="topic" key={t.id}>
                      <div className="row between">
                        <h3>{t.name}</h3>
                        <div className="row">
                          <Button
                            variant="ghost"
                            aria-label={`Editar ${t.name}`}
                            onClick={() =>
                              setEditor({
                                type: "topic",
                                id: t.id,
                                initial: { ...t },
                              })
                            }
                          >
                            <Pencil size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            aria-label={`Excluir ${t.name}`}
                            onClick={() =>
                              setDeletion({ table: "topics", id: t.id })
                            }
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>
                      <span className="badge">{t.status}</span>
                      <p className="muted small">
                        {total} questões ·{" "}
                        {total
                          ? percent(
                              q.reduce((n, q) => n + q.correct, 0),
                              total,
                            ) + "% de acertos"
                          : "Sem desempenho"}{" "}
                        · Último estudo:{" "}
                        {t.last_studied
                          ? new Date(t.last_studied).toLocaleDateString("pt-BR")
                          : "ainda não registrado"}
                      </p>
                      {t.notes && <p className="small preserve">{t.notes}</p>}
                      <div className="row">
                        {[
                          ["Aula", t.lesson_url],
                          ["PDF", t.pdf_url],
                          ["Questões", t.questions_url],
                        ]
                          .filter(([, url]) => url)
                          .map(([label, url]) => (
                            <Button
                              key={label}
                              variant="ghost"
                              onClick={() => openMaterial(url)}
                            >
                              <ExternalLink size={13} />
                              {label}
                            </Button>
                          ))}
                      </div>
                    </article>
                  );
                })
              ) : (
                <Empty title="Adicione os assuntos desta disciplina" />
              )}
            </>
          ) : (
            <Empty title="Escolha uma disciplina">
              Selecione uma disciplina para cadastrar assuntos e links de
              materiais.
            </Empty>
          )}
        </section>
      </div>
      {editor && (
        <Editor
          title={editor.type === "discipline" ? "Disciplina" : "Assunto"}
          fields={editor.type === "discipline" ? disciplineFields : topicFields}
          initial={editor.initial}
          onSave={(v) =>
            editor.type === "discipline"
              ? repository.discipline(v, editor.id)
              : repository.topic(v, editor.id)
          }
          onClose={() => setEditor(null)}
        />
      )}{" "}
      {deletion && (
        <Confirm
          title="Excluir item?"
          description="A exclusão remove assuntos e revisões associados. Disciplinas com sessões ou questões são preservadas; pause-as para manter o histórico."
          onConfirm={() => repository.remove(deletion.table, deletion.id)}
          onClose={() => setDeletion(null)}
        />
      )}
    </>
  );
}
