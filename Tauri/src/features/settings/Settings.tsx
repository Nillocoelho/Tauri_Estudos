import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Download, Upload, Settings2, Bell } from "lucide-react";
import { useApp, repository } from "../../app/store";
import { Button } from "../../components/ui/button";
import { Editor, Confirm, type Field } from "../../components/forms";
export function Settings() {
  const d = useApp((s) => s.data)!,
    run = useApp((s) => s.run),
    busy = useApp((s) => s.busy);
  const [edit, setEdit] = useState(false),
    [restore, setRestore] = useState(false),
    [message, setMessage] = useState("");
  const fields: Field[] = [
    {
      key: "completion_notice",
      label: "Aviso ao concluir duração planejada",
      type: "checkbox",
    },
    { key: "plan_name", label: "Nome do plano", required: true },
    { key: "target", label: "Concurso e área" },
    {
      key: "weekly_minutes",
      label: "Meta semanal em minutos",
      type: "number",
      min: 1,
      max: 10080,
    },
    {
      key: "default_minutes",
      label: "Duração padrão em minutos",
      type: "number",
      min: 1,
      max: 480,
    },
    {
      key: "theme",
      label: "Aparência",
      type: "select",
      options: [
        { value: "dark", label: "Escura" },
        { value: "light", label: "Clara" },
      ],
    },
    { key: "study_time", label: "Horário habitual", type: "time" },
    {
      key: "reminder_before",
      label: "Antecedência do lembrete (min)",
      type: "number",
      min: 0,
      max: 120,
    },
    {
      key: "reminders",
      label: "Ativar lembretes antes e no horário",
      type: "checkbox",
    },
    {
      key: "close_to_tray",
      label: "Ao fechar, minimizar para a bandeja",
      type: "checkbox",
    },
    {
      key: "review_days",
      label: "Intervalos de revisão (dias separados por vírgula)",
    },
  ];
  return (
    <>
      <div className="page-title">
        <div>
          <h1>Configurações</h1>
          <p className="muted">Um plano que se adapta à sua vida.</p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="card">
          <Settings2 size={22} />
          <h2>Seu plano de estudos</h2>
          <dl>
            <dt>Plano</dt>
            <dd>{d.settings.plan_name}</dd>
            <dt>Objetivo</dt>
            <dd>{d.settings.target}</dd>
            <dt>Meta semanal</dt>
            <dd>{d.settings.weekly_minutes / 60} horas</dd>
            <dt>Duração padrão</dt>
            <dd>{d.settings.default_minutes} minutos</dd>
            <dt>Horário habitual</dt>
            <dd>{d.settings.study_time}</dd>
            <dt>Ao fechar a janela</dt>
            <dd>
              {d.settings.close_to_tray
                ? "Minimizar para a bandeja"
                : "Encerrar aplicativo"}
            </dd>
            <dt>Revisões</dt>
            <dd>{d.settings.review_days} dias</dd>
          </dl>
          <Button onClick={() => setEdit(true)}>Editar configurações</Button>
        </section>
        <div className="column">
          <section className="card">
            <h2>Backup e restauração</h2>
            <p className="muted">
              Seus dados ficam neste computador. Guarde cópias em um local
              seguro de sua escolha.
            </p>
            <div className="row">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run(async () =>
                    setMessage(await invoke<string>("backup_database")),
                  )
                }
              >
                <Download size={16} />
                Criar backup
              </Button>
              <Button
                variant="outline"
                disabled={
                  busy || d.sessions.some((s) => s.state !== "completed")
                }
                onClick={() => setRestore(true)}
              >
                <Upload size={16} />
                Restaurar
              </Button>
            </div>
            <p className="small muted">
              A restauração valida a versão, a integridade e os relacionamentos.
              Uma cópia dos dados atuais é criada antes da substituição.
            </p>
          </section>
          <section className="card">
            <h2>
              <Bell size={19} /> Notificações locais
            </h2>
            <p className="muted">
              Lembretes funcionam enquanto o aplicativo estiver aberto,
              inclusive na bandeja. Não há lembretes com o aplicativo encerrado.
              O aviso de duração não encerra sua sessão.
            </p>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                run(async () =>
                  setMessage(
                    "Permissão de notificações: " +
                      (await invoke<string>("notification_permission")),
                  ),
                )
              }
            >
              Solicitar permissão ao Windows
            </Button>
          </section>
          <section className="card">
            <h3>Feito para durar</h3>
            <p className="muted small">
              Offline · SQLite local · Sem conta ou serviços remotos
            </p>
            <p className="muted small">
              O plano inicial é uma sugestão editável e não representa um edital
              validado do TJ-PB. Você pode adaptar o plano para outras áreas.
              Múltiplos planos simultâneos não estão disponíveis nesta versão.
            </p>
          </section>
        </div>
      </div>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {edit && (
        <Editor
          title="Configurações do plano"
          initial={{ ...d.settings }}
          fields={fields}
          onSave={(v) => repository.settings(v)}
          onClose={() => setEdit(false)}
        />
      )}{" "}
      {restore && (
        <Confirm
          title="Restaurar um backup?"
          description="Você escolherá um arquivo SQLite. Os dados atuais serão substituídos após validação; uma cópia de segurança local será preservada."
          onConfirm={async () =>
            setMessage(await invoke<string>("restore_database"))
          }
          onClose={() => setRestore(false)}
        />
      )}
    </>
  );
}
