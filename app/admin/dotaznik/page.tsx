import type { Metadata } from 'next';
import { isAdminEmail, requireSurveyAdmin } from '@/lib/auth';
import { SITE_URL } from '@/lib/config';
import { listResponses, type SurveyFilters } from '@/lib/survey-data';
import Dashboard from './Dashboard';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Dotazník: odpovědi', robots: { index: false, follow: false } };

type Search = Promise<Record<keyof SurveyFilters, string | undefined>>;

export default async function SurveyAdmin({ searchParams }: { searchParams: Search }) {
  const user = await requireSurveyAdmin();
  const params = await searchParams;
  const filters: SurveyFilters = {
    src: params.src || undefined,
    phone: params.phone || undefined,
    age: params.age || undefined,
    pick: params.pick || undefined,
    device: params.device || undefined,
    meet: params.meet || undefined,
  };
  const all = await listResponses();
  return (
    <section className="section">
      <div className="container">
        <Dashboard all={all} filters={filters} fullAdmin={isAdminEmail(user.email)} siteUrl={SITE_URL} />
      </div>
    </section>
  );
}
