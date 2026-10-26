import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./ui/button";
import { useApp } from "../app/store";
export type Field = {
  key: string;
  label: string;
  type?:
    | "text"
    | "number"
    | "date"
    | "time"
    | "color"
    | "textarea"
    | "select"
    | "checkbox";
  options?: { value: string | number; label: string }[];
  required?: boolean;
  min?: number;
  max?: number;
};
export type Values = Record<string, string | number | null>;
export function Editor({
  title,
  fields,
  initial,
  onSave,
  onClose,
  children,
}: {
  title: string;
  fields: Field[] | ((v: Values) => Field[]);
  initial: Values;
  onSave: (v: Values) => Promise<unknown>;
  onClose: () => void;
  children?: ReactNode;
}) {
  const [values, setValues] = useState(initial);
  const run = useApp((s) => s.run),
    busy = useApp((s) => s.busy),
    error = useApp((s) => s.error);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <div className="row between">
          <h2 id="dialog-title">{title}</h2>
          <Button
            variant="ghost"
            aria-label="Fechar formulário"
            disabled={busy}
            onClick={onClose}
          >
            <X size={18} />
          </Button>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(() => onSave(values))) onClose();
          }}
        >
          {children}
          <div className="form-grid">
            {(typeof fields === "function" ? fields(values) : fields).map(
              (f) => (
                <label
                  key={f.key}
                  className={f.type === "textarea" ? "wide" : ""}
                >
                  <span>{f.label}</span>
                  {f.type === "select" ? (
                    <select
                      aria-label={f.label}
                      required={f.required}
                      value={values[f.key] ?? ""}
                      onChange={(e) =>
                        setValues({
                          ...values,
                          [f.key]: e.target.value,
                          ...(f.key === "discipline_id"
                            ? { topic_id: null }
                            : {}),
                        })
                      }
                    >
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : f.type === "textarea" ? (
                    <textarea
                      aria-label={f.label}
                      required={f.required}
                      maxLength={10000}
                      value={values[f.key] ?? ""}
                      onChange={(e) =>
                        setValues({ ...values, [f.key]: e.target.value })
                      }
                    />
                  ) : f.type === "checkbox" ? (
                    <input
                      aria-label={f.label}
                      type="checkbox"
                      checked={!!Number(values[f.key])}
                      onChange={(e) =>
                        setValues({
                          ...values,
                          [f.key]: e.target.checked ? 1 : 0,
                        })
                      }
                    />
                  ) : (
                    <input
                      aria-label={f.label}
                      autoFocus={
                        f ===
                        (typeof fields === "function"
                          ? fields(values)
                          : fields)[0]
                      }
                      required={f.required}
                      type={f.type ?? "text"}
                      min={f.min}
                      max={f.max}
                      maxLength={
                        f.type === "text" || !f.type ? 2000 : undefined
                      }
                      value={values[f.key] ?? ""}
                      onChange={(e) =>
                        setValues({
                          ...values,
                          [f.key]:
                            f.type === "number"
                              ? e.target.valueAsNumber
                              : e.target.value,
                        })
                      }
                    />
                  )}
                </label>
              ),
            )}
          </div>
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
          <div className="row end">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              Cancelar
            </Button>
            <Button disabled={busy} type="submit">
              {busy ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{children ?? "Seus registros aparecerão aqui quando você começar."}</p>
    </div>
  );
}
export function Confirm({
  title,
  description,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  onConfirm: () => Promise<unknown>;
  onClose: () => void;
}) {
  return (
    <Editor
      title={title}
      fields={[]}
      initial={{}}
      onSave={onConfirm}
      onClose={onClose}
    >
      <p className="muted">{description}</p>
    </Editor>
  );
}
