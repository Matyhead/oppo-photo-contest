'use client';

import { useEffect, useRef, useState } from 'react';
import { isAnswered, type Answers, type AnswerValue, type MultiQuestion, type Option, type Question, type SingleQuestion } from '@/lib/survey';
import { ANKETA, ANKETA_TEXT } from '@/lib/survey-anketa';
import { ANKETA_CONSENT_TEXT, cleanAnketaContact } from '@/lib/anketa-contact';
import { submitAnketa } from './actions';
import PhoneIllustration from './PhoneIllustration';
import s from './anketa.module.css';

// Separate drafts because the last two questions changed order and ranking semantics.
const DRAFT_KEY = `oppo-anketa-${ANKETA.slug}-ranking-v2`;
const DONE_KEY = `oppo-anketa-${ANKETA.slug}-hotovo`;

type Draft = { answers: Answers; reached: number; startedAt: number; contactStep?: boolean };

const store = {
  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage blocked: the poll still works */
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const [INTRO_Q, ...QUESTIONS] = ANKETA.questions as [SingleQuestion, ...Question[]];

function Mark({ on, multi }: { on: boolean; multi: boolean }) {
  return (
    <span className={`${s.mark} ${multi ? s.markSquare : ''} ${on ? s.markOn : ''}`} aria-hidden>
      <svg viewBox="0 0 16 16" width="12" height="12">
        <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function Options({ q, value, onChange }: { q: Question; value: AnswerValue | undefined; onChange: (v: AnswerValue) => void }) {
  if (q.kind === 'matrix') return null;
  const multi = q.kind === 'multi';
  const ranked = multi && q.ranked;
  const picked = multi ? ((value as string[]) || []) : value ? [value as string] : [];
  const toggle = (o: Option) => {
    if (!multi) return onChange(o.value);
    if (picked.includes(o.value)) return onChange(picked.filter((v) => v !== o.value));
    if (o.exclusive) return onChange([o.value]);
    const kept = picked.filter((v) => !(q as MultiQuestion).options.find((x) => x.value === v)?.exclusive);
    onChange([...kept, o.value]);
  };
  return (
    <div className={s.options} role={multi ? 'group' : 'radiogroup'} aria-label={q.title}>
      {q.options.map((o) => {
        const on = picked.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            role={multi ? undefined : 'radio'}
            aria-checked={multi ? undefined : on}
            aria-pressed={multi ? on : undefined}
            className={`${s.option} ${on ? s.optionOn : ''} ${o.exclusive ? s.optionLast : ''}`}
            onClick={() => toggle(o)}
          >
            {ranked && !o.exclusive ? (
              <span className={`${s.mark} ${on ? s.markOn : ''}`} aria-hidden>{on ? picked.indexOf(o.value) + 1 : ''}</span>
            ) : <Mark on={on} multi={multi} />}
            {ranked && on && !o.exclusive && <span className={s.srOnly}>{picked.indexOf(o.value) + 1}. místo: </span>}
            <span>{o.label}</span>
          </button>
        );
      })}
      {ranked && <p className={s.help} aria-live="polite">
        {picked.some((v) => q.options.find((o) => o.value === v)?.exclusive)
          ? 'Vybráno: nic by mě nepřesvědčilo.'
          : `Seřazeno ${picked.length} z ${q.options.filter((o) => !o.exclusive).length} možností.`}
      </p>}
    </div>
  );
}

export default function Anketa({ src, photos, logoSrc }: { src: string; photos: string[]; logoSrc: string | null }) {
  const [answers, setAnswers] = useState<Answers>({});
  // How many of the 8 questions are on the page: 0 = still on the intro.
  const [reached, setReached] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [ready, setReady] = useState(false);
  const [contactStep, setContactStep] = useState(false);
  const [wantsNewsletter, setWantsNewsletter] = useState(false);
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const contactBlock = useRef<HTMLElement>(null);
  const blocks = useRef<(HTMLElement | null)[]>([]);
  const honeypot = useRef<HTMLInputElement>(null);
  const scrollTo = useRef<number | null>(null);

  useEffect(() => {
    if (store.get(DONE_KEY)) setDone(true);
    else {
      const d = store.get<Draft>(DRAFT_KEY);
      if (d?.answers) {
        setAnswers(d.answers);
        setReached(Math.min(QUESTIONS.length, Math.max(0, d.reached || 0)));
        setStartedAt(d.startedAt || 0);
        setContactStep(d.contactStep === true);
      }
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || done) return;
    // Contact details and consent stay in memory; never persist them in localStorage.
    if (Object.keys(answers).length) store.set(DRAFT_KEY, { answers, reached, startedAt, contactStep } satisfies Draft);
  }, [ready, done, answers, reached, startedAt, contactStep]);

  useEffect(() => {
    if (!contactStep) return;
    contactBlock.current?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    contactBlock.current?.focus({ preventScroll: true });
  }, [contactStep]);

  // Bring a newly revealed question into view once it has rendered.
  useEffect(() => {
    const i = scrollTo.current;
    if (i === null) return;
    scrollTo.current = null;
    const el = blocks.current[i];
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - Math.min(96, window.innerHeight * 0.12);
    window.scrollTo({ top, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [reached]);

  const reveal = (count: number) => {
    if (count <= reached) return;
    scrollTo.current = count - 1;
    setReached(count);
  };

  const answer = (q: Question, v: AnswerValue, index: number) => {
    setAnswers((a) => ({ ...a, [q.id]: v }));
    setError('');
    // Single choice moves on by itself; multiple choice waits for the button.
    if (q.kind === 'single' && index + 1 < QUESTIONS.length) setTimeout(() => reveal(index + 2), reducedMotion() ? 0 : 260);
  };

  const start = () => {
    if (!startedAt) setStartedAt(Date.now());
    if (reached === 0) reveal(1);
    else {
      const el = blocks.current[0];
      el?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    }
  };

  const allAnswered = ANKETA.questions.every((q) => isAnswered(q, answers[q.id]));
  const answeredCount = ANKETA.questions.filter((q) => isAnswered(q, answers[q.id])).length;

  const contactReady = !cleanAnketaContact({ newsletter: true, email, consent }).error;

  async function submit(newsletter: boolean) {
    if (busy || !allAnswered) return;
    if (!newsletter) {
      setWantsNewsletter(false);
      setEmail('');
      setConsent(false);
    }
    setBusy(true);
    setError('');
    const res = await submitAnketa({
      answers, src, startedAt, website: honeypot.current?.value || '',
      newsletter, email: newsletter ? email : '', consent: newsletter && consent,
    }).catch(() => ({
      ok: false as const,
      error: 'Spojení se přerušilo. Zkuste to prosím znovu.',
    }));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    store.remove(DRAFT_KEY);
    store.set(DONE_KEY, true);
    setDone(true);
    window.scrollTo({ top: 0 });
  }

  const visual = (
    <figure className={s.visual}>
      {photos.length ? (
        <div className={s.photos} data-count={photos.length}>
          {photos.map((p, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p} src={p} alt={i === 0 ? 'Telefon v širším formátu, pohled zepředu' : ''} loading={i === 0 ? 'eager' : 'lazy'} />
          ))}
        </div>
      ) : (
        <PhoneIllustration className={s.illustration} />
      )}
    </figure>
  );

  return (
    <div className={s.root} data-anketa>
      <div className={s.progress} aria-hidden>
        <span style={{ width: `${done ? 100 : (answeredCount / ANKETA.questions.length) * 100}%` }} />
      </div>

      <div className={s.page}>
        <header className={s.top}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logoSrc ? <img className={s.logo} src={logoSrc} alt="OPPO" /> : <b>OPPO</b>}
        </header>

        {done ? (
          <section className={s.hero}>
            <div className={s.heroText}>
              <h1 className={s.h1}>{ANKETA_TEXT.thanksTitle}</h1>
              <p className={s.lead}>{ANKETA_TEXT.thanks}</p>
            </div>
            {visual}
          </section>
        ) : (
          <>
            <section className={s.hero}>
              <div className={s.heroText}>
                <h1 className={s.h1}>{ANKETA_TEXT.title}</h1>
                <p className={s.lead}>{ANKETA_TEXT.intro}</p>
                <p className={s.time}>{ANKETA_TEXT.time}</p>
              </div>
              {visual}
            </section>

            <section className={s.block}>
              <div className={s.qHead}>
                <span className={s.num} aria-label={`Otázka 1 z ${ANKETA.questions.length}`}>1/{ANKETA.questions.length}</span>
                <h2 className={s.qTitle}>{INTRO_Q.title}</h2>
              </div>
              <Options q={INTRO_Q} value={answers[INTRO_Q.id]} onChange={(v) => setAnswers((a) => ({ ...a, [INTRO_Q.id]: v }))} />
              <div className={s.actions}>
                <button type="button" className={s.primary} disabled={!answers[INTRO_Q.id]} onClick={start}>
                  {ANKETA_TEXT.start}
                  <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden>
                    <path d="M4 10h11m-4-4.5L15.5 10 11 14.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </section>

            <ol className={s.list} start={2}>
              {QUESTIONS.slice(0, reached).map((q, i) => {
                const last = i === QUESTIONS.length - 1;
                const ok = isAnswered(q, answers[q.id]);
                return (
                  <li
                    key={q.id}
                    ref={(el) => {
                      blocks.current[i] = el;
                    }}
                    className={`${s.block} ${s.reveal}`}
                  >
                    <div className={s.qHead}>
                      <span className={s.num} aria-label={`Otázka ${i + 2} z ${ANKETA.questions.length}`}>{i + 2}/{ANKETA.questions.length}</span>
                      <div>
                        <h2 className={s.qTitle}>{q.title}</h2>
                        {q.help && <p className={s.help}>{q.help}</p>}
                      </div>
                    </div>
                    <Options q={q} value={answers[q.id]} onChange={(v) => answer(q, v, i)} />
                    {q.kind === 'multi' && !last && reached === i + 1 && (
                      <div className={s.actions}>
                        <button type="button" className={s.secondary} disabled={!ok} onClick={() => reveal(i + 2)}>
                          Další otázka
                        </button>
                      </div>
                    )}
                    {last && !contactStep && (
                      <div className={s.actions}>
                        <button type="button" className={s.primary} disabled={!allAnswered} onClick={() => setContactStep(true)}>
                          Pokračovat
                        </button>
                        {!allAnswered && ok && <span className={s.note}>Chybí odpověď u některé otázky výše.</span>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
            {contactStep && (
              <section ref={contactBlock} tabIndex={-1} aria-labelledby="newsletter-title" className={`${s.block} ${s.contact} ${s.reveal}`}>
                <p className={s.optional}>Zcela nepovinné</p>
                <h2 id="newsletter-title" className={s.qTitle}>Chcete být s OPPO v obraze?</h2>
                <p className={s.contactLead}>Chcete od nás občas dostávat novinky o telefonech OPPO, tipy a pozvánky? Pokud ne, anketu jednoduše dokončete bez e-mailu.</p>
                <div className={s.actions}>
                  <button type="button" className={s.secondary} disabled={busy} aria-expanded={wantsNewsletter} aria-controls="newsletter-form" onClick={() => { setWantsNewsletter(true); setError(''); }}>
                    Ano, chci novinky
                  </button>
                  <button type="button" className={s.secondary} disabled={busy || !allAnswered} onClick={() => submit(false)}>
                    {busy ? 'Odesílám…' : 'Ne, děkuji — dokončit anketu'}
                  </button>
                </div>
                {wantsNewsletter && (
                  <form id="newsletter-form" className={s.contactForm} onSubmit={(e) => { e.preventDefault(); if (contactReady) void submit(true); }}>
                    <label className={s.field}>
                      <span>E-mail pro odběr novinek</span>
                      <input type="email" inputMode="email" autoComplete="email" maxLength={120} required value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} placeholder="vas@email.cz" disabled={busy} />
                    </label>
                    <label className={s.consent}>
                      <input type="checkbox" required checked={consent} onChange={(e) => { setConsent(e.target.checked); setError(''); }} disabled={busy} />
                      <span>{ANKETA_CONSENT_TEXT}{' '}<a href="/ochrana-osobnich-udaju#novinky" target="_blank" rel="noopener noreferrer">Ochrana osobních údajů</a></span>
                    </label>
                    <div className={s.actions}>
                      <button type="submit" className={s.primary} disabled={busy || !allAnswered || !contactReady}>
                        {busy ? 'Odesílám…' : 'Odeslat anketu a přihlásit se'}
                      </button>
                    </div>
                  </form>
                )}
                {!allAnswered && <p className={s.note}>Nejdřív prosím doplňte odpověď u otázky výše.</p>}
                {error && <p className={s.error} role="alert">{error}</p>}
              </section>
            )}
          </>
        )}
      </div>
      <input ref={honeypot} className={s.hp} tabIndex={-1} autoComplete="off" aria-hidden name="website" />
    </div>
  );
}
