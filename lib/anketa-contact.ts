import { isValidEmail } from './disposable';
import { ORGANIZER } from './config';

export const ANKETA_CONSENT_VERSION = 'oppo-newsletter-2026-11-23';
export const ANKETA_CONSENT_TEXT = `Souhlasím, aby mi ${ORGANIZER.name}, distributor OPPO v České republice, zasílal e-mailem novinky, nabídky a pozvánky týkající se OPPO. Souhlas je dobrovolný a mohu ho kdykoli odvolat na ${ORGANIZER.email}.`;

type ContactInput = { newsletter?: unknown; email?: unknown; consent?: unknown };
type ContactResult = { email: string | null; consent: boolean; error?: string };

/** Skipping never stores an email, even if the browser sends a previously typed value. */
export function cleanAnketaContact(input: ContactInput): ContactResult {
  if (input.newsletter !== true) return { email: null, consent: false };
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!email || email.length > 120 || !isValidEmail(email)) {
    return { email: null, consent: false, error: 'Pro odběr novinek vyplňte platný e-mail. Nebo anketu dokončete bez odběru.' };
  }
  if (input.consent !== true) {
    return { email: null, consent: false, error: 'K odběru novinek potřebujeme váš souhlas. Anketu můžete dokončit i bez něj.' };
  }
  return { email, consent: true };
}
