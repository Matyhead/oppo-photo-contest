'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  OPEN_MAX,
  OPEN_QUESTIONS,
  QUESTIONS,
  SHAPES,
  SURVEY,
  canLeaveContact,
  isAnswered,
  labelOf,
  type AnswerValue,
  type Answers,
  type MatrixQuestion,
  type MultiQuestion,
  type OpenAnswers,
  type Option,
  type Question,
  type Shape,
  type SingleQuestion,
} from '@/lib/survey';
import { submitSurvey } from './actions';
import s from './survey.module.css';

const DRAFT_KEY = `oppo-dotaznik-${SURVEY.slug}`;
const DONE_KEY = `${DRAFT_KEY}-hotovo`;
const ADVANCE_MS = 320;

type Summary = { pick?: string; storage?: string; ram?: string; budget?: string };
type Draft = { index: number; answers: Answers; open: OpenAnswers; meet: string; email: string; consent: boolean; startedAt: number };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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
      /* storage blocked: the survey still works, it just won't survive a reload */
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

/** Keeps "10 000 Kč" and "512 GB" on one line. */
const nb = (t: string) => t.replace(/(\d) (?=\d)/g, '$1\u00a0').replace(/ (Kč|GB|TB)\b/g, '\u00a0$1');

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* ---------------------------------------------------------------- drawings */

const SHAPE_BOX: Record<Shape, { w: number; h: number }> = {
  A: { w: 22, h: 46 },
  B: { w: 34, h: 46 },
  C: { w: 64, h: 46 },
};

export function ShapeIcon({ shape, size = 46 }: { shape: Shape; size?: number }) {
  const { w, h } = SHAPE_BOX[shape];
  const k = size / 46;
  return (
    <svg className={s.shapeIcon} width={w * k} height={h * k} viewBox={`-1.5 -1.5 ${w + 3} ${h + 3}`} aria-hidden>
      <rect x="0" y="0" width={w} height={h} rx="6" fill="none" stroke="currentColor" strokeWidth="2.2" />
      {shape === 'C' && <line x1={w / 2} y1="5" x2={w / 2} y2={h - 5} stroke="currentColor" strokeWidth="1.6" strokeDasharray="3 3" />}
      <circle cx={shape === 'C' ? w * 0.75 : w / 2} cy="5.5" r="1.6" fill="currentColor" />
    </svg>
  );
}

/** The phone in the margin: widens on arrival, fills with progress, takes the shape you pick. */
function Device({ shape, pre, fill, label }: { shape: Shape; pre: boolean; fill: number; label?: string }) {
  const ar = pre ? 0.46 : shape === 'A' ? 0.48 : shape === 'B' ? 0.74 : 1.42;
  return (
    <div
      className={`${s.device} ${shape === 'C' && !pre ? s.deviceOpen : ''}`}
      style={{ ['--ar' as string]: ar, ['--fill' as string]: `${Math.round(fill * 100)}%` }}
    >
      <div className={s.deviceFill} />
      <div className={s.deviceCam} />
      <div className={s.deviceFold} />
      {label && <div className={s.deviceLabel}>{label}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- answers */

function Check({ on, square }: { on: boolean; square?: boolean }) {
  return (
    <span className={`${s.check} ${square ? s.checkSquare : ''} ${on ? s.checkOn : ''}`} aria-hidden>
      <svg viewBox="0 0 16 16" width="12" height="12">
        <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function StorageCell({ level }: { level: number }) {
  return (
    <span className={s.storageCell} aria-hidden>
      <span style={{ height: `${Math.round(level * 100)}%` }} />
    </span>
  );
}

function ScaleBars({ step, of }: { step: number; of: number }) {
  return (
    <span className={s.scaleBars} aria-hidden>
      {Array.from({ length: of }, (_, i) => (
        <span key={i} className={i <= step ? s.scaleOn : ''} style={{ height: `${30 + (70 * (i + 1)) / of}%` }} />
      ))}
    </span>
  );
}

function SingleChoice({ q, value, onPick }: { q: SingleQuestion; value?: string; onPick: (v: string) => void }) {
  if (q.style === 'shapes') {
    const shaped = q.options.filter((o) => o.shape);
    const rest = q.options.filter((o) => !o.shape);
    return (
      <div role="radiogroup" aria-label={q.title}>
        <div className={s.shapeCards}>
          {shaped.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={value === o.value}
              className={`${s.shapeCard} ${value === o.value ? s.on : ''}`}
              onClick={() => onPick(o.value)}
            >
              <span className={s.shapeArt}>
                <ShapeIcon shape={o.shape!} size={64} />
              </span>
              <span className={s.shapeName}>{o.label}</span>
              <span className={s.shapeLetter}>{o.shape}</span>
            </button>
          ))}
        </div>
        {rest.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className={`${s.textChoice} ${value === o.value ? s.textChoiceOn : ''}`}
            onClick={() => onPick(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    );
  }

  const ranked = q.options.filter((o) => q.style !== 'scale' || o.value !== 'nevim');
  const groupClass = q.style === 'tiles' ? s.tiles : q.style === 'storage' ? s.storageGrid : s.list;
  return (
    <div role="radiogroup" aria-label={q.title} className={groupClass}>
      {q.options.map((o) => {
        const on = value === o.value;
        const step = ranked.indexOf(o);
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            className={`${q.style === 'tiles' ? s.tile : q.style === 'storage' ? s.storageTile : s.row} ${on ? s.on : ''}`}
            onClick={() => onPick(o.value)}
          >
            {q.style === 'storage' && (o.level ? <StorageCell level={o.level} /> : <span className={s.storageNone} aria-hidden />)}
            {q.style === 'scale' && (step >= 0 ? <ScaleBars step={step} of={ranked.length} /> : <span className={s.scaleBarsEmpty} aria-hidden />)}
            <span className={s.rowLabel}>{nb(o.label)}</span>
            {(q.style === 'list' || q.style === 'scale') && <Check on={on} />}
          </button>
        );
      })}
    </div>
  );
}

function MultiChoice({ q, value, onChange }: { q: MultiQuestion; value: string[]; onChange: (v: string[]) => void }) {
  const full = q.max !== undefined && value.length >= q.max;
  const toggle = (o: Option) => {
    if (value.includes(o.value)) return onChange(value.filter((v) => v !== o.value));
    if (o.exclusive) return onChange([o.value]);
    const kept = value.filter((v) => !q.options.find((x) => x.value === v)?.exclusive);
    if (q.max !== undefined && kept.length >= q.max) return;
    onChange([...kept, o.value]);
  };
  return (
    <div className={s.list} role="group" aria-label={q.title}>
      {q.options.map((o) => {
        const on = value.includes(o.value);
        const blocked = !on && full && !o.exclusive;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            disabled={blocked}
            className={`${s.row} ${on ? s.on : ''} ${o.exclusive ? s.rowExclusive : ''}`}
            onClick={() => toggle(o)}
          >
            {o.shape && <ShapeIcon shape={o.shape} size={26} />}
            <span className={s.rowLabel}>{o.label}</span>
            <Check on={on} square />
          </button>
        );
      })}
    </div>
  );
}

function Matrix({ q, value, onChange }: { q: MatrixQuestion; value: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  if (q.style === 'shapes') {
    return (
      <div className={s.matrix}>
        <div className={s.matrixHead} aria-hidden>
          <span />
          {q.columns.map((c) => (
            <span key={c.value} className={s.matrixHeadCell}>
              {c.shape ? <ShapeIcon shape={c.shape} size={22} /> : <span className={s.same}>=</span>}
              <span>{c.label}</span>
            </span>
          ))}
        </div>
        {q.rows.map((r) => (
          <div key={r.value} className={s.matrixRow} role="radiogroup" aria-label={r.label}>
            <span className={s.matrixLabel}>{r.label}</span>
            {q.columns.map((c) => {
              const on = value[r.value] === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={`${r.label}: ${c.label}`}
                  className={`${s.matrixCell} ${on ? s.on : ''}`}
                  onClick={() => onChange({ ...value, [r.value]: c.value })}
                >
                  {c.shape ? <ShapeIcon shape={c.shape} size={22} /> : <span className={s.same}>=</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className={s.scaleMatrix}>
      {q.rows.map((r) => (
        <div key={r.value} role="radiogroup" aria-label={r.label}>
          <div className={s.scaleRowLabel}>
            {(r.value === 'B' || r.value === 'C') && <ShapeIcon shape={r.value} size={24} />}
            {r.label}
          </div>
          <div className={s.scaleRow}>
            {q.columns.map((c, i) => {
              const on = value[r.value] === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={`${s.scaleChip} ${on ? s.on : ''}`}
                  onClick={() => onChange({ ...value, [r.value]: c.value })}
                >
                  <ScaleBars step={i} of={q.columns.length} />
                  <span>{nb(c.label)}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- page */

type ScreenId = 'intro' | 'shapes' | 'open' | 'contact' | 'done' | `q:${string}`;

export default function Survey({ src, siteUrl, logoSrc }: { src: string; siteUrl: string; logoSrc: string | null }) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [open, setOpen] = useState<OpenAnswers>({});
  const [meet, setMeet] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const [pre, setPre] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [shareNote, setShareNote] = useState('');
  const [ready, setReady] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const honeypot = useRef<HTMLInputElement>(null);

  const screens = useMemo<ScreenId[]>(
    () => [
      'intro',
      'shapes',
      ...QUESTIONS.map((q) => `q:${q.id}` as const),
      'open',
      ...(canLeaveContact(answers) ? (['contact'] as const) : []),
      'done',
    ],
    [answers],
  );
  const screen: ScreenId = summary ? 'done' : screens[Math.min(index, screens.length - 1)];
  const question = screen.startsWith('q:') ? QUESTIONS.find((q) => `q:${q.id}` === screen) : undefined;
  const qNumber = question ? QUESTIONS.indexOf(question) + 1 : 0;
  const lastBeforeDone = screens[screens.length - 2];

  // Restore an unfinished survey, or the result of a finished one.
  useEffect(() => {
    const done = store.get<Summary>(DONE_KEY);
    if (done) setSummary(done);
    else {
      const d = store.get<Draft>(DRAFT_KEY);
      if (d && d.answers) {
        setAnswers(d.answers);
        setOpen(d.open || {});
        setMeet(d.meet || '');
        setEmail(d.email || '');
        setConsent(Boolean(d.consent));
        setStartedAt(d.startedAt || 0);
        setIndex(Math.max(0, Math.min(d.index || 0, QUESTIONS.length + 3)));
      }
    }
    setReady(true);
    // The one moment on arrival: today's tall phone widens.
    const t = setTimeout(() => setPre(false), prefersReducedMotion() ? 0 : 450);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!ready || summary || index === 0) return;
    store.set(DRAFT_KEY, { index, answers, open, meet, email, consent, startedAt } satisfies Draft);
  }, [ready, summary, index, answers, open, meet, email, consent, startedAt]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const go = useCallback(
    (to: number) => {
      if (timer.current) clearTimeout(timer.current);
      setError('');
      setDir(to < index ? 'back' : 'fwd');
      setIndex(to);
      window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    },
    [index],
  );
  const next = () => go(index + 1);
  const back = () => go(Math.max(0, index - 1));

  const setAnswer = (id: string, v: AnswerValue) => setAnswers((a) => ({ ...a, [id]: v }));

  const pickSingle = (q: Question, v: string) => {
    setAnswer(q.id, v);
    if (timer.current) clearTimeout(timer.current);
    const at = index;
    timer.current = setTimeout(() => {
      setDir('fwd');
      setIndex((i) => (i === at ? i + 1 : i));
      window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }, prefersReducedMotion() ? 120 : ADVANCE_MS);
  };

  async function finish() {
    setBusy(true);
    setError('');
    const res = await submitSurvey({
      answers,
      open,
      meet: canLeaveContact(answers) ? meet : undefined,
      email: canLeaveContact(answers) ? email : '',
      consent,
      src,
      startedAt,
      website: honeypot.current?.value || '',
    }).catch(() => ({ ok: false as const, error: 'Spojení se přerušilo. Zkuste to prosím znovu.' }));
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const result: Summary = {
      pick: answers.pick as string,
      storage: answers.storage_next as string,
      ram: answers.ram_ideal as string,
      budget: answers.budget_next as string,
    };
    store.remove(DRAFT_KEY);
    store.set(DONE_KEY, result);
    setDir('fwd');
    setSummary(result);
    window.scrollTo({ top: 0 });
  }

  async function share() {
    const url = `${siteUrl}/dotaznik?src=sdileni`;
    const text = 'Vyplnil(a) jsem dotazník OPPO o tom, jaký telefon chceme mít v ruce příště. Co byste vybrali vy?';
    try {
      if (navigator.share) {
        await navigator.share({ title: SURVEY.title, text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareNote('Odkaz je zkopírovaný.');
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
      setShareNote(url);
    }
  }

  // Device state
  const picked = (summary?.pick ?? answers.pick) as string | undefined;
  const shape: Shape = picked === 'A' || picked === 'B' || picked === 'C' ? picked : 'B';
  const storageValue = (summary?.storage ?? answers.storage_next) as string | undefined;
  const storageQ = QUESTIONS.find((q) => q.id === 'storage_next')!;
  const storageLabel = storageValue && storageValue !== 'jedno' ? labelOf(storageQ, storageValue) : undefined;
  const fill = screen === 'done' ? 1 : question ? (qNumber - 1) / QUESTIONS.length : screen === 'open' || screen === 'contact' ? 0.96 : 0;

  const phase = screen === 'intro' ? s.isIntro : screen === 'done' ? s.isDone : s.isAsking;
  const answered = question ? isAnswered(question, answers[question.id]) : true;
  const emailOk = EMAIL_RE.test(email.trim());
  const contactReady =
    meet === 'ano' ? emailOk && consent : meet === 'ne' ? !email.trim() || (emailOk && consent) : false;

  return (
    <div className={`${s.root} ${phase}`} data-survey>
      <div className={s.shell}>
        <header className={s.top}>
          {logoSrc ? <img className={s.logo} src={logoSrc} alt="OPPO" /> : <span className={s.logoWord}>OPPO</span>}
          {question && (
            <div className={s.progress} aria-label={`Otázka ${qNumber} z ${QUESTIONS.length}`}>
              <span>
                {qNumber} <span className={s.progressOf}>z {QUESTIONS.length}</span>
              </span>
            </div>
          )}
          {(screen === 'open' || screen === 'contact') && <div className={s.progress}>Skoro hotovo</div>}
        </header>

        <aside className={s.rail} aria-hidden>
          <Device shape={shape} pre={pre} fill={fill} label={storageLabel} />
        </aside>

        <main className={s.stage}>
          <div key={screen} className={`${s.screen} ${dir === 'back' ? s.fromLeft : s.fromRight}`}>
            {screen === 'intro' && (
              <>
                <h1 className={s.h1}>{SURVEY.title}</h1>
                <p className={s.lead}>
                  Ptáme se vás na upřímný názor, který nám pomůže vytvořit ideální produkt a nabídku pro český trh.
                </p>
                <div className={s.actions}>
                  <button type="button" className={s.primary} onClick={() => { if (!startedAt) setStartedAt(Date.now()); next(); }}>
                    {index > 0 || Object.keys(answers).length ? 'Pokračovat' : 'Začít'}
                  </button>
                  <span className={s.note}>Odpovědi stačí zaklikávat, zabere to maximálně {SURVEY.minutes} minut.</span>
                </div>
              </>
            )}

            {screen === 'shapes' && (
              <>
                <h2 className={s.h2}>Tři tvary telefonu</h2>
                <p className={s.lead}>Budeme se ptát hlavně na tyhle tři. Jsou to jen orientační tvary, ne konkrétní výrobky.</p>
                <div className={s.shapeIntro}>
                  {SHAPES.map((x) => (
                    <div key={x.shape} className={s.shapeIntroItem}>
                      <span className={s.shapeIntroArt}><ShapeIcon shape={x.shape} size={72} /></span>
                      <span className={s.shapeIntroName}><b>{x.shape}</b> {x.name}</span>
                      <span className={s.shapeIntroText}>{x.text}</span>
                    </div>
                  ))}
                </div>
                <div className={s.actions}>
                  <button type="button" className={s.primary} onClick={next}>Pokračovat</button>
                  <button type="button" className={s.ghost} onClick={back}>Zpět</button>
                </div>
              </>
            )}

            {question && (
              <>
                <h2 className={s.h2}>{question.title}</h2>
                {question.help && <p className={s.help}>{question.help}</p>}
                {question.kind === 'single' && (
                  <SingleChoice q={question} value={answers[question.id] as string | undefined} onPick={(v) => pickSingle(question, v)} />
                )}
                {question.kind === 'multi' && (
                  <MultiChoice q={question} value={(answers[question.id] as string[]) || []} onChange={(v) => setAnswer(question.id, v)} />
                )}
                {question.kind === 'matrix' && (
                  <Matrix q={question} value={(answers[question.id] as Record<string, string>) || {}} onChange={(v) => setAnswer(question.id, v)} />
                )}
                <div className={s.actions}>
                  {(question.kind !== 'single' || answered) && (
                    <button type="button" className={s.primary} onClick={next} disabled={!answered}>
                      Pokračovat
                    </button>
                  )}
                  <button type="button" className={s.ghost} onClick={back}>Zpět</button>
                  {question.kind === 'multi' && question.max && (
                    <span className={s.note}>
                      Vybráno {((answers[question.id] as string[]) || []).length} z {question.max}
                    </span>
                  )}
                </div>
              </>
            )}

            {screen === 'open' && (
              <>
                <h2 className={s.h2}>Chcete něco dodat?</h2>
                <p className={s.lead}>Nepovinné, klidně přeskočte.</p>
                {OPEN_QUESTIONS.map((o) => (
                  <label key={o.id} className={s.field}>
                    <span className={s.fieldLabel}>{o.label}</span>
                    <textarea
                      className={s.textarea}
                      maxLength={OPEN_MAX}
                      value={open[o.id] || ''}
                      onChange={(e) => setOpen((x) => ({ ...x, [o.id]: e.target.value }))}
                    />
                  </label>
                ))}
                <div className={s.actions}>
                  {lastBeforeDone === 'open' ? (
                    <button type="button" className={s.primary} onClick={finish} disabled={busy}>
                      {busy ? 'Odesílám…' : 'Odeslat odpovědi'}
                    </button>
                  ) : (
                    <button type="button" className={s.primary} onClick={next}>
                      {open.need || open.message ? 'Pokračovat' : 'Přeskočit'}
                    </button>
                  )}
                  <button type="button" className={s.ghost} onClick={back}>Zpět</button>
                </div>
              </>
            )}

            {screen === 'contact' && (
              <>
                <h2 className={s.h2}>Chcete to s námi probrat osobně?</h2>
                <p className={s.lead}>
                  Některé z vás pozveme na osobní setkání, kde budeme široké telefony probírat podrobněji. Chcete, abychom vás pozvali?
                </p>
                <div role="radiogroup" aria-label="Pozvánka na osobní setkání" className={s.tiles}>
                  {[
                    ['ano', 'Ano, pozvěte mě'],
                    ['ne', 'Ne, děkuji'],
                  ].map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={meet === v}
                      className={`${s.tile} ${meet === v ? s.on : ''}`}
                      onClick={() => setMeet(v)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {meet && (
                  <>
                    <label className={`${s.field} ${s.fieldGap}`}>
                      <span className={s.fieldLabel}>
                        E-mail {meet === 'ne' && <span className={s.optional}>(nepovinné)</span>}
                      </span>
                      <span className={s.fieldHint}>
                        {meet === 'ano'
                          ? 'Pošleme vám na něj pozvánku s termínem a místem.'
                          : 'Když ho vyplníte, můžeme vám napsat, až budeme hledat lidi na vyzkoušení.'}
                      </span>
                      <input
                        className={s.input}
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        maxLength={120}
                        required={meet === 'ano'}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="vas@email.cz"
                      />
                    </label>
                    {(meet === 'ano' || email.trim()) && (
                      <label className={s.consent}>
                        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                        <span>
                          Souhlasím, aby mi Jswin s.r.o., distributor OPPO v České republice, napsal kvůli tomuto průzkumu (pozvánka na setkání
                          nebo vyzkoušení). E-mail po skončení průzkumu smažeme.{' '}
                          <a href="/ochrana-osobnich-udaju#dotaznik" target="_blank" rel="noopener">Ochrana osobních údajů</a>
                        </span>
                      </label>
                    )}
                  </>
                )}
                <div className={s.actions}>
                  <button type="button" className={s.primary} onClick={finish} disabled={busy || !contactReady}>
                    {busy ? 'Odesílám…' : 'Odeslat odpovědi'}
                  </button>
                  <button type="button" className={s.ghost} onClick={back}>Zpět</button>
                </div>
                {meet === 'ano' && !EMAIL_RE.test(email.trim()) && <p className={s.note}>Pro pozvánku vyplňte prosím e-mail.</p>}
              </>
            )}

            {screen === 'done' && summary && <Result summary={summary} onShare={share} shareNote={shareNote} />}

            {error && <p className={s.error} role="alert">{error}</p>}
          </div>
        </main>
      </div>
      <input ref={honeypot} className={s.hp} tabIndex={-1} autoComplete="off" aria-hidden name="website" />
    </div>
  );
}

function Result({ summary, onShare, shareNote }: { summary: Summary; onShare: () => void; shareNote: string }) {
  const q = (id: string) => QUESTIONS.find((x) => x.id === id)!;
  const shapeName =
    summary.pick === 'A' || summary.pick === 'B' || summary.pick === 'C'
      ? SHAPES.find((x) => x.shape === summary.pick)!.name
      : 'Zatím nevíte';
  const rows = [
    ['Tvar', shapeName],
    ['Paměť', summary.storage ? labelOf(q('storage_next'), summary.storage) : '-'],
    ...(summary.ram ? [['RAM', labelOf(q('ram_ideal'), summary.ram)]] : []),
    ['Rozpočet', summary.budget ? labelOf(q('budget_next'), summary.budget) : '-'],
  ];
  return (
    <>
      <h2 className={s.h2}>Díky, tohle je váš příští telefon.</h2>
      <dl className={s.specs}>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{nb(v)}</dd>
          </div>
        ))}
      </dl>
      <p className={s.lead}>Pošlete dotazník dál. Čím víc názorů, tím přesněji víme, jaký telefon dává smysl.</p>
      <div className={s.actions}>
        <button type="button" className={s.primary} onClick={onShare}>Sdílet dotazník</button>
        <a className={s.ghost} href="https://www.oppo.com/cz/" target="_blank" rel="noopener">Web OPPO</a>
      </div>
      {shareNote && <p className={s.note} role="status">{shareNote}</p>}
    </>
  );
}
