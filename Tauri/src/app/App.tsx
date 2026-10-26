import { useEffect, lazy, Suspense } from "react";
import { NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "@tauri-apps/api/core";
import {
  LayoutDashboard,
  Play,
  CircleDashed,
  Library,
  CheckCheck,
  CalendarClock,
  History as HistoryIcon,
  Settings as SettingsIcon,
  GraduationCap,
  ArrowRight,
  AlertCircle,
  RefreshCw,
  X,
} from "lucide-react";
import { useApp, repository } from "./store";
import { Button } from "../components/ui/button";
const Dashboard = lazy(async () => ({
  default: (await import("../features/dashboard/Dashboard")).Dashboard,
}));
import { Study } from "../features/timer/Study";
import { Cycle } from "../features/study-cycle/Cycle";
import { Disciplines } from "../features/disciplines/Disciplines";
import { Questions } from "../features/questions/Questions";
import { Reviews } from "../features/reviews/Reviews";
import { History } from "../features/history/History";
import { Settings } from "../features/settings/Settings";
const navigation = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/estudar", label: "Estudar", icon: Play },
  { path: "/ciclo", label: "Ciclo de Estudos", icon: CircleDashed },
  { path: "/disciplinas", label: "Disciplinas", icon: Library },
  { path: "/questoes", label: "Questões", icon: CheckCheck },
  { path: "/revisoes", label: "Revisões", icon: CalendarClock },
  { path: "/historico", label: "Histórico", icon: HistoryIcon },
  { path: "/configuracoes", label: "Configurações", icon: SettingsIcon },
];
export function App() {
  const { data, error, busy, load, run, clear } = useApp();
  const navigate = useNavigate();
  useEffect(() => {
    void load();
    if (!isTauri()) return;
    const unsubscribers = [
      listen("data-changed", () => {
        void useApp.getState().load();
      }),
      listen<{ interval_id: string; stamp: string }>(
        "checkpoint",
        ({ payload }) => {
          useApp.setState((state) =>
            state.data
              ? {
                  data: {
                    ...state.data,
                    intervals: state.data.intervals.map((i) =>
                      i.id === payload.interval_id
                        ? { ...i, checkpoint_at: payload.stamp }
                        : i,
                    ),
                  },
                }
              : {},
          );
        },
      ),
      listen("show-session", () => navigate("/estudar")),
      listen("native-error", (e) =>
        useApp.setState({ error: String(e.payload) }),
      ),
      listen("timer-complete", () => {
        void load();
      }),
    ];
    return () => {
      unsubscribers.forEach((p) => void p.then((unsubscribe) => unsubscribe()));
    };
  }, [load, navigate]);
  useEffect(() => {
    document.documentElement.dataset.theme = data?.settings.theme ?? "dark";
  }, [data?.settings.theme]);
  if (!data)
    return (
      <div className="boot">
        <GraduationCap size={38} />
        <h1>Projeto Aprovação</h1>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <Button onClick={() => load()}>
              <RefreshCw size={16} />
              Tentar novamente
            </Button>
          </>
        ) : (
          <p>Preparando seu espaço de estudo…</p>
        )}
      </div>
    );
  if (!data.settings.onboarding)
    return (
      <div className="boot">
        <div className="welcome card">
          <span className="brand-mark">
            <GraduationCap size={30} />
          </span>
          <p className="eyebrow">BEM-VINDO AO SEU PRÓXIMO PASSO</p>
          <h1>Projeto Aprovação</h1>
          <p className="muted">
            Um espaço tranquilo para organizar seus estudos e perceber sua
            evolução.
          </p>
          <section className="welcome-plan">
            <h3>Começar com o Projeto Aprovação 2030</h3>
            <p>
              TJ-PB · Tecnologia da Informação
              <br />
              10 horas por semana · Sessões de 60 minutos · 19h
            </p>
            <p className="small muted">
              Oito disciplinas iniciais, todas editáveis. Esta é uma sugestão de
              organização, sem validação do edital. Nenhum histórico será
              criado.
            </p>
          </section>
          <div className="column">
            <Button
              disabled={busy}
              onClick={() => run(() => repository.onboard(true))}
            >
              Criar plano sugerido <ArrowRight size={16} />
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => run(() => repository.onboard(false))}
            >
              Começar com um plano vazio
            </Button>
          </div>
          {error && <p role="alert">{error}</p>}
        </div>
      </div>
    );
  const active = data.sessions.find((s) => s.state !== "completed");
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <NavLink to="/" className="brand">
          <span className="brand-mark">
            <GraduationCap size={21} />
          </span>
          <div>
            Projeto<span>Aprovação</span>
          </div>
        </NavLink>
        <div className="workspace-label">ESPAÇO DE ESTUDOS</div>
        <nav aria-label="Navegação principal">
          {navigation.map((n) => (
            <NavLink key={n.path} to={n.path} end={n.path === "/"}>
              <n.icon size={18} />
              <span>{n.label}</span>
              {n.path === "/estudar" && active && <span className="dot" />}
              {n.path === "/revisoes" &&
                data.reviews.some(
                  (r) =>
                    r.state === "pending" && new Date(r.due_at) <= new Date(),
                ) && (
                  <span className="nav-count">
                    {
                      data.reviews.filter(
                        (r) =>
                          r.state === "pending" &&
                          new Date(r.due_at) <= new Date(),
                      ).length
                    }
                  </span>
                )}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="plan-indicator">
            <span className="dot" />
            <span>{data.settings.plan_name}</span>
          </div>
          <p>Seu ritmo. Sua aprovação.</p>
          <span className="small muted">Versão 0.1.0 · Local e offline</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>{data.settings.plan_name}</span>
          <span className="muted small">{data.settings.target}</span>
        </header>
        <main>
          {error && (
            <div role="alert" className="error-banner">
              <AlertCircle size={18} />
              <span>{error}</span>
              <Button variant="ghost" aria-label="Fechar aviso" onClick={clear}>
                <X size={15} />
              </Button>
            </div>
          )}
          <Suspense fallback={<p className="muted">Carregando indicadores…</p>}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/estudar" element={<Study />} />
              <Route path="/ciclo" element={<Cycle />} />
              <Route path="/disciplinas" element={<Disciplines />} />
              <Route path="/questoes" element={<Questions />} />
              <Route path="/revisoes" element={<Reviews />} />
              <Route path="/historico" element={<History />} />
              <Route path="/configuracoes" element={<Settings />} />
              <Route path="*" element={<Dashboard />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
}
