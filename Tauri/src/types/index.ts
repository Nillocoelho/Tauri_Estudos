export interface Settings {
  id: number;
  plan_name: string;
  target: string;
  weekly_minutes: number;
  default_minutes: number;
  theme: "dark" | "light";
  study_time: string;
  reminder_before: number;
  reminders: number;
  close_to_tray: number;
  completion_notice: number;
  review_days: string;
  onboarding: number;
}
export interface Discipline {
  id: string;
  name: string;
  category: string;
  color: string;
  priority: number;
  active: number;
}
export interface Topic {
  id: string;
  discipline_id: string;
  name: string;
  position: number;
  status: string;
  notes: string;
  lesson_url: string;
  pdf_url: string;
  questions_url: string;
  last_studied: string | null;
}
export interface CycleItem {
  id: string;
  cycle_id: string;
  discipline_id: string;
  position: number;
  minutes: number;
  priority: number;
  paused: number;
}
export interface Session {
  id: string;
  discipline_id: string;
  topic_id: string | null;
  cycle_item_id: string | null;
  planned_minutes: number;
  started_at: string;
  ended_at: string | null;
  state: "running" | "paused" | "recovery" | "completed";
  notes: string;
}
export interface Interval {
  id: string;
  session_id: string;
  started_at: string;
  checkpoint_at: string;
  ended_at: string | null;
}
export interface Questions {
  id: string;
  discipline_id: string;
  topic_id: string | null;
  total: number;
  correct: number;
  errors: number;
  date: string;
  board: string;
  notes: string;
}
export interface ErrorNote {
  id: string;
  discipline_id: string;
  topic_id: string | null;
  description: string;
  explanation: string;
  source: string;
  created_at: string;
  reviewed: number;
}
export interface Review {
  id: string;
  topic_id: string;
  due_at: string;
  stage: number;
  state: "pending" | "done";
  performance: number | null;
  completed_at: string | null;
}
export interface Data {
  settings: Settings;
  disciplines: Discipline[];
  topics: Topic[];
  cycle: CycleItem[];
  cursor: number;
  sessions: Session[];
  intervals: Interval[];
  questions: Questions[];
  errors: ErrorNote[];
  reviews: Review[];
}
