import type { Metadata } from 'next';
import { isAdminEmail, requireSurveyAdmin } from '@/lib/auth';
import { SITE_URL } from '@/lib/config';
import { listResponses, surveyByVersion, type SurveyFilters } from '@/lib/survey-data';
import Dashboard from './Dashboard';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Dotazník: odpovědi', robots: { index: false, follow: false } };

type Search = Promise<Record<string, string | undefined>>;

export default async function SurveyAdmin({ searchParams }: { searchParams: Search }) {
  const user = await requireSurveyAdmin();
  const params = await searchParams;
  const def = surveyByVersion(params.verze);
  // Only filters this survey offers; anything else in the URL is ignored.
  const allowed = ['src', 'device', ...(def.meeting ? ['meet'] : []), ...def.filters];
  const filters: SurveyFilters = Object.fromEntries(allowed.map((k) => [k, params[k] || undefined]));
  const all = await listResponses(def.slug);
  return (
    <section className="section">
      <div className="container">
        <Dashboard def={def} all={all} filters={filters} fullAdmin={isAdminEmail(user.email)} siteUrl={SITE_URL} />
      </div>
    </section>
  );
}
