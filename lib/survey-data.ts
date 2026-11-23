import 'server-only';
import { createAdminClient } from './supabase/admin';
import { isSupabaseConfigured } from './env';
import { QUESTIONS, SURVEY, type Answers, type OpenAnswers, type Question } from './survey';
import { ANKETA } from './survey-anketa';
import { MAIN_SURVEY, type SurveyDef } from './survey';

export type SurveyResponse = {
  id: string;
  answers: Answers;
  open_answers: OpenAnswers;
  src: string;
  wants_meeting: boolean | null;
  email: string | null;
  contact_consent: boolean;
  duration_s: number | null;
  device: string | null;
  created_at: string;
};

/** src, device and meet are fixed; any other key is a question id with the picked value. */
export type SurveyFilters = Record<string, string | undefined>;

/** Survey shown in the admin: ?verze=anketa for the test survey, the main one otherwise. */
export const surveyByVersion = (v: string | undefined): SurveyDef => (v === 'anketa' ? ANKETA : MAIN_SURVEY);

/** null = the table is missing (supabase/dotaznik.sql not run yet). */
export async function listResponses(slug: string = SURVEY.slug): Promise<SurveyResponse[] | null> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createAdminClient();
  const rows: SurveyResponse[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('survey_responses')
      .select('id, answers, open_answers, src, wants_meeting, email, contact_consent, duration_s, device, created_at')
      .eq('survey', slug)
      .order('created_at', { ascending: false })
      .range(from, from + 999);
    if (error) {
      if (error.code === '42P01' || /does not exist/i.test(error.message)) return null;
      console.error('survey list failed:', error.message);
      return rows;
    }
    rows.push(...((data ?? []) as SurveyResponse[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

export function applyFilters(rows: SurveyResponse[], f: SurveyFilters) {
  const questionFilters = Object.entries(f).filter(([k, v]) => v && !['src', 'device', 'meet'].includes(k));
  return rows.filter(
    (r) =>
      (!f.src || r.src === f.src) &&
      (!f.device || r.device === f.device) &&
      (!f.meet || (f.meet === 'ano' ? r.wants_meeting === true : r.wants_meeting !== true)) &&
      questionFilters.every(([k, v]) => r.answers[k] === v),
  );
}

export type Count = { value: string; label: string; count: number };

/** Single and multi questions: one count per option, in the question's own order. */
export function countOptions(rows: SurveyResponse[], q: Question): { counts: Count[]; answered: number } {
  if (q.kind === 'matrix') return { counts: [], answered: 0 };
  const counts = q.options.map((o) => ({ value: o.value, label: o.label, count: 0 }));
  let answered = 0;
  for (const r of rows) {
    const v = r.answers[q.id];
    const picked = typeof v === 'string' ? [v] : Array.isArray(v) ? v : [];
    if (picked.length) answered++;
    for (const p of picked) {
      const c = counts.find((x) => x.value === p);
      if (c) c.count++;
    }
  }
  return { counts, answered };
}

/** Matrix questions: for each row, one count per column. */
export function countMatrix(rows: SurveyResponse[], q: Question) {
  if (q.kind !== 'matrix') return [];
  return q.rows.map((row) => {
    const counts = q.columns.map((c) => ({ value: c.value, label: c.label, count: 0 }));
    let answered = 0;
    for (const r of rows) {
      const v = r.answers[q.id];
      const cell = v && typeof v === 'object' && !Array.isArray(v) ? v[row.value] : undefined;
      const c = counts.find((x) => x.value === cell);
      if (c) {
        c.count++;
        answered++;
      }
    }
    return { value: row.value, label: row.label, counts, answered };
  });
}

export function sourceLabel(src: string) {
  if (src === 'primo') return 'Přímý odkaz';
  if (src === 'sdileni') return 'Sdílení z dotazníku';
  return src;
}

export function countSources(rows: SurveyResponse[]): Count[] {
  const map = new Map<string, number>();
  rows.forEach((r) => map.set(r.src, (map.get(r.src) ?? 0) + 1));
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, label: sourceLabel(value), count }));
}

export function median(values: number[]) {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
}

export const questionById = (id: string) => QUESTIONS.find((q) => q.id === id)!;
