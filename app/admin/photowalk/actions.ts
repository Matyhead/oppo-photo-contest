'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requirePhotowalkAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { PHOTOWALK } from '@/lib/config';
import { attendanceReady, getSeatCounts, listSignups, RSVP_SAMPLE, thanksReady, type Signup } from '@/lib/photowalk';
import { confirmedEmail, reminderEmail, thanksEmail } from '@/lib/photowalk-email';
import { sendMail } from '@/lib/mail';

const PATH = '/admin/photowalk';

function back(params: Record<string, string>): never {
  redirect(`${PATH}?${new URLSearchParams(params).toString()}`);
}

function refresh() {
  revalidatePath(PATH);
  revalidatePath('/photowalk');
}

async function load(id: string) {
  const supabase = createAdminClient();
  const { data } = await supabase.from('photowalk_signups').select('id, name, email, status').eq('id', id).eq('event', PHOTOWALK.slug).maybeSingle();
  return data as { id: string; name: string; email: string; status: string } | null;
}

async function sendConfirmation(id: string, email: string) {
  const mail = confirmedEmail();
  const res = await sendMail({ ...mail, to: email });
  if (res.ok) {
    await createAdminClient().from('photowalk_signups').update({ confirm_email_sent_at: new Date().toISOString() }).eq('id', id);
  }
  return res;
}

export async function confirmSignup(formData: FormData) {
  await requirePhotowalkAdmin();
  const signup = await load(String(formData.get('id') || ''));
  if (!signup) back({ err: 'Přihláška nenalezena.' });
  if (signup.status === 'confirmed') back({ err: `${signup.name} už potvrzené místo má.` });

  const counts = await getSeatCounts();
  if (counts.confirmed >= PHOTOWALK.capacity) {
    back({ err: `Všech ${PHOTOWALK.capacity} míst je potvrzených. Nejdřív někomu místo uvolni, nebo zvyš kapacitu v lib/config.ts.` });
  }

  const fresh = (await attendanceReady()) ? { attendance: null, attendance_at: null, reminder_sent_at: null } : {};
  const { error } = await createAdminClient()
    .from('photowalk_signups')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString(), ...fresh })
    .eq('id', signup.id);
  if (error) back({ err: `Uložení se nepovedlo: ${error.message}` });

  const res = await sendConfirmation(signup.id, signup.email);
  refresh();
  if (!res.ok) back({ err: `${signup.name} má potvrzené místo, ale e-mail se nepodařilo odeslat: ${res.error}` });
  back({ ok: `${signup.name} má potvrzené místo, potvrzovací e-mail odešel na ${signup.email}. Odpověď serveru: ${res.response}` });
}

export async function resendConfirmation(formData: FormData) {
  await requirePhotowalkAdmin();
  const signup = await load(String(formData.get('id') || ''));
  if (!signup || signup.status !== 'confirmed') back({ err: 'E-mail jde poslat znovu jen potvrzeným.' });
  const res = await sendConfirmation(signup.id, signup.email);
  refresh();
  if (!res.ok) back({ err: `E-mail se nepodařilo odeslat: ${res.error}` });
  back({ ok: `Potvrzení odešlo znovu na ${signup.email}. Odpověď serveru: ${res.response}` });
}

export async function setSignupStatus(formData: FormData) {
  await requirePhotowalkAdmin();
  const signup = await load(String(formData.get('id') || ''));
  const status = String(formData.get('status') || '');
  if (!signup) back({ err: 'Přihláška nenalezena.' });
  if (status !== 'pending' && status !== 'declined') back({ err: 'Neznámý stav.' });
  await createAdminClient()
    .from('photowalk_signups')
    .update({ status, confirmed_at: null })
    .eq('id', signup.id);
  refresh();
  back({ ok: status === 'pending' ? `${signup.name} je zpátky mezi čekajícími.` : `${signup.name} je mezi odmítnutými.` });
}

export async function deleteSignup(formData: FormData) {
  await requirePhotowalkAdmin();
  const signup = await load(String(formData.get('id') || ''));
  if (!signup) back({ err: 'Přihláška nenalezena.' });
  if (formData.get('confirm') !== 'ano') back({ err: 'Pro smazání napiš do políčka „ano“.' });
  await createAdminClient().from('photowalk_signups').delete().eq('id', signup.id);
  refresh();
  back({ ok: `Přihláška od ${signup.name} je smazaná.` });
}

/** Sends the real confirmation e-mail to the signed-in admin, to check the SMTP setup. */
export async function sendTestEmail() {
  const user = await requirePhotowalkAdmin();
  const mail = confirmedEmail();
  const res = await sendMail({ ...mail, subject: `[TEST] ${mail.subject}`, to: user.email });
  if (!res.ok) back({ err: `Testovací e-mail se nepodařilo odeslat: ${res.error}` });
  back({ ok: `Testovací e-mail odešel na ${user.email}. Odpověď serveru: ${res.response}. Kdyby do pár minut nedorazil, mrkni do spamu.` });
}

// ---- Reminder before the walk ----------------------------------------------

const people = (n: number) => (n === 1 ? '1 účastníkovi' : `${n} účastníkům`);

async function sendReminderTo(s: Signup) {
  const res = await sendMail({ ...reminderEmail(s.rsvp_token!), to: s.email });
  if (res.ok) await createAdminClient().from('photowalk_signups').update({ reminder_sent_at: new Date().toISOString() }).eq('id', s.id);
  return res;
}

/** mode "nove": confirmed who have not had the reminder yet. mode "znovu": everyone confirmed who has not answered. */
export async function sendReminders(formData: FormData) {
  await requirePhotowalkAdmin();
  if (!(await attendanceReady())) back({ err: 'Nejdřív je potřeba v Supabase spustit supabase/photowalk-ucast.sql.' });
  const again = formData.get('mode') === 'znovu';
  const targets = (await listSignups()).filter(
    (s) => s.status === 'confirmed' && !s.attendance && s.rsvp_token && (again || !s.reminder_sent_at),
  );
  if (targets.length === 0) back({ err: again ? 'Všichni potvrzení už odpověděli.' : 'Všichni potvrzení už připomínku dostali.' });

  let sent = 0;
  const failed: string[] = [];
  for (const s of targets) {
    const res = await sendReminderTo(s);
    if (res.ok) sent += 1;
    else failed.push(`${s.name} (${res.error})`);
  }
  refresh();
  if (failed.length) back({ err: `Připomínka odešla ${people(sent)}. Nepodařilo se: ${failed.join(', ')}` });
  back({ ok: `Připomínka odešla ${people(sent)}. Odpovědi uvidíš tady ve sloupci Stav.` });
}

export async function sendReminder(formData: FormData) {
  await requirePhotowalkAdmin();
  const id = String(formData.get('id') || '');
  const signup = (await listSignups()).find((s) => s.id === id);
  if (!signup || signup.status !== 'confirmed' || !signup.rsvp_token) back({ err: 'Připomínka jde poslat jen potvrzeným.' });
  const res = await sendReminderTo(signup);
  refresh();
  if (!res.ok) back({ err: `Připomínku se nepodařilo odeslat: ${res.error}` });
  back({ ok: `Připomínka odešla na ${signup.email}.` });
}

/** The reminder to the signed-in admin; its buttons open a sample page that saves nothing. */
export async function sendReminderTest() {
  const user = await requirePhotowalkAdmin();
  const mail = reminderEmail(RSVP_SAMPLE);
  const res = await sendMail({ ...mail, subject: `[TEST] ${mail.subject}`, to: user.email });
  if (!res.ok) back({ err: `Testovací připomínku se nepodařilo odeslat: ${res.error}` });
  back({ ok: `Ukázka připomínky odešla na ${user.email}. Tlačítka v ní otevřou ukázkovou stránku, nic se neuloží.` });
}

// ---- Thank-you e-mail after the walk ---------------------------------------

/** One code per line; a single line means everyone gets the same code. */
function parseCodes(raw: FormDataEntryValue | null) {
  const codes = String(raw || '')
    .split(/[\n,;]+/)
    .map((c) => c.replace(/\s+/g, ''))
    .filter(Boolean);
  return [...new Set(codes)];
}

const validUntilOf = (formData: FormData) => String(formData.get('valid') || '').trim().slice(0, 40) || undefined;

/** Everyone still confirmed after the walk gets the thank-you once; a second click only reaches those it has not reached yet. */
export async function sendThanks(formData: FormData) {
  await requirePhotowalkAdmin();
  if (!(await thanksReady())) back({ err: 'Nejdřív je potřeba v Supabase spustit supabase/photowalk-podekovani.sql.' });
  const codes = parseCodes(formData.get('codes'));
  if (codes.length === 0) back({ err: 'Napiš slevový kód, který má v e-mailu být.' });
  if (codes.some((c) => c.length > 64)) back({ err: 'Některý kód je moc dlouhý. Každý kód dej na samostatný řádek.' });
  const validUntil = validUntilOf(formData);

  const all = await listSignups();
  const targets = all.filter((s) => s.status === 'confirmed' && !s.thanks_sent_at);
  if (targets.length === 0) back({ err: 'Poděkování už dostali všichni potvrzení.' });

  // With several codes everyone gets their own one, skipping codes that already went out.
  const used = new Set(all.map((s) => s.discount_code).filter(Boolean));
  const pool = codes.length === 1 ? codes : codes.filter((c) => !used.has(c));
  if (codes.length > 1 && pool.length < targets.length) {
    back({ err: `Kódů je málo: ${pool.length} nepoužitých na ${targets.length} lidí. Doplň je, nebo nech jeden kód pro všechny.` });
  }

  const supabase = createAdminClient();
  let sent = 0;
  const failed: string[] = [];
  for (const [i, s] of targets.entries()) {
    const code = codes.length === 1 ? codes[0] : pool[i];
    const res = await sendMail({ ...thanksEmail(code, validUntil), to: s.email });
    if (res.ok) {
      sent += 1;
      await supabase.from('photowalk_signups').update({ thanks_sent_at: new Date().toISOString(), discount_code: code }).eq('id', s.id);
    } else failed.push(`${s.name} (${res.error})`);
  }
  refresh();
  if (failed.length) back({ err: `Poděkování odešlo ${people(sent)}. Nepodařilo se: ${failed.join(', ')}. Zkus to znovu, odejde jen jim.` });
  back({ ok: `Poděkování se slevovým kódem odešlo ${people(sent)}.` });
}

export async function sendThanksTest(formData: FormData) {
  const user = await requirePhotowalkAdmin();
  const code = parseCodes(formData.get('codes'))[0] || 'UKAZKA500';
  const mail = thanksEmail(code, validUntilOf(formData));
  const res = await sendMail({ ...mail, subject: `[TEST] ${mail.subject}`, to: user.email });
  if (!res.ok) back({ err: `Ukázku poděkování se nepodařilo odeslat: ${res.error}` });
  back({ ok: `Ukázka poděkování s kódem ${code} odešla na ${user.email}.` });
}
