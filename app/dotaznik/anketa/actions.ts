'use server';

import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/env';
import { clientIp, hashIp } from '@/lib/security';
import { cleanAnswers, cleanSource } from '@/lib/survey';
import { ANKETA } from '@/lib/survey-anketa';
import { ANKETA_CONSENT_TEXT, ANKETA_CONSENT_VERSION, cleanAnketaContact } from '@/lib/anketa-contact';

export type AnketaInput = { answers: unknown; src?: string; startedAt?: number; website?: string; newsletter?: boolean; email?: string; consent?: boolean };
export type AnketaResult = { ok: true } | { ok: false; error: string };

// Shared with the main survey's table; events and offices share one IP, so the limit is generous.
const MAX_PER_IP_PER_HOUR = 30;

export async function submitAnketa(input: AnketaInput): Promise<AnketaResult> {
  if (input.website) return { ok: true }; // honeypot

  const { answers, error } = cleanAnswers(input.answers, ANKETA.questions);
  if (error) return { ok: false, error: `${error} Doplňte ji prosím a odešlete znovu.` };
  const contact = cleanAnketaContact(input);
  if (contact.error) return { ok: false, error: contact.error };
  if (!isSupabaseConfigured()) return { ok: false, error: 'Web ještě není napojený na databázi.' };

  const ipHash = hashIp(await clientIp());
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
    survey: ANKETA.slug,
    answers,
    open_answers: contact.consent ? {
      newsletter_consent_version: ANKETA_CONSENT_VERSION,
      newsletter_consent_text: ANKETA_CONSENT_TEXT,
      newsletter_consent_at: new Date().toISOString(),
    } : {},
    email: contact.email,
    contact_consent: contact.consent,
    src: cleanSource(input.src),
    duration_s: seconds !== null && seconds >= 0 && seconds < 3 * 60 * 60 ? seconds : null,
    device: /Mobi|Android|iPhone/i.test(ua) ? 'mobil' : 'pocitac',
    ip_hash: ipHash,
  });
  if (dbError) {
    console.error('anketa insert failed:', dbError.message);
    return { ok: false, error: 'Odpovědi se nepodařilo uložit. Zkuste to prosím znovu.' };
  }
  return { ok: true };
}
