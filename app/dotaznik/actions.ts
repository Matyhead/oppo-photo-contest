'use server';

import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/env';
import { isDisposableEmail, isValidEmail } from '@/lib/disposable';
import { clientIp, hashIp } from '@/lib/security';
import { SURVEY, canLeaveContact, cleanAnswers, cleanOpen, cleanSource } from '@/lib/survey';

export type SubmitInput = {
  answers: unknown;
  open: unknown;
  /** 'ano' = wants an invitation to the in-person session, 'ne' = doesn't. */
  meet?: string;
  email?: string;
  consent?: boolean;
  src?: string;
  startedAt?: number;
  website?: string;
};
export type SubmitResult = { ok: true } | { ok: false; error: string };

// Events and offices share one IP, so the limit is generous; it only stops scripted floods.
const MAX_PER_IP_PER_HOUR = 30;

export async function submitSurvey(input: SubmitInput): Promise<SubmitResult> {
  // Bots fill every field, people never see this one.
  if (input.website) return { ok: true };

  const { answers, error } = cleanAnswers(input.answers);
  if (error) return { ok: false, error: `${error} Vraťte se prosím o krok zpět.` };
  const open = cleanOpen(input.open);

  const asked = canLeaveContact(answers);
  const meet = input.meet === 'ano' ? true : input.meet === 'ne' ? false : null;
  if (asked && meet === null) return { ok: false, error: 'Vyberte prosím, jestli chcete pozvat na osobní setkání.' };
  const email = asked ? String(input.email || '').trim().toLowerCase() : '';
  if (meet && !email) return { ok: false, error: 'Pro pozvánku na setkání potřebujeme váš e-mail.' };
  const wantsContact = Boolean(email);
  if (wantsContact) {
    if (!isValidEmail(email) || email.length > 120) return { ok: false, error: 'Zkontrolujte prosím e-mail, takhle nevypadá platně.' };
    if (isDisposableEmail(email)) return { ok: false, error: 'Jednorázové e-maily nepodporujeme. Použijte prosím svůj běžný e-mail.' };
    if (!input.consent) {
      return { ok: false, error: meet ? 'Bez souhlasu vám pozvánku nemůžeme poslat.' : 'K e-mailu potřebujeme souhlas, jinak vám nemůžeme napsat. Nebo ho nechte prázdný.' };
    }
  }

  if (!isSupabaseConfigured()) return { ok: false, error: 'Web ještě není napojený na databázi.' };

  const ip = await clientIp();
  const ipHash = hashIp(ip);
  const supabase = createAdminClient();
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('survey_responses')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('created_at', hourAgo);
  if ((count ?? 0) >= MAX_PER_IP_PER_HOUR) return { ok: false, error: 'Z tohoto připojení přišlo moc odpovědí. Zkuste to prosím za hodinu.' };

  const started = Number(input.startedAt);
  const seconds = Number.isFinite(started) && started > 0 ? Math.round((Date.now() - started) / 1000) : null;
  const ua = (await headers()).get('user-agent') || '';

  const { error: dbError } = await supabase.from('survey_responses').insert({
    survey: SURVEY.slug,
    answers,
    open_answers: open,
    src: cleanSource(input.src),
    wants_meeting: asked ? meet : null,
    email: wantsContact ? email : null,
    contact_consent: wantsContact,
    // A tab left open overnight is not a 10-hour answer.
    duration_s: seconds !== null && seconds >= 0 && seconds < 3 * 60 * 60 ? seconds : null,
    device: /Mobi|Android|iPhone/i.test(ua) ? 'mobil' : 'pocitac',
    ip_hash: ipHash,
  });
  if (dbError) {
    if (dbError.code === '42P01') console.error('survey: table missing, run supabase/dotaznik.sql');
    else console.error('survey insert failed:', dbError.message);
    return { ok: false, error: 'Odpovědi se nepodařilo uložit. Zkuste to prosím znovu.' };
  }
  return { ok: true };
}
