import type { Metadata, Viewport } from 'next';
import { SITE_URL } from '@/lib/config';
import { img } from '@/lib/images';
import { SURVEY, cleanSource } from '@/lib/survey';
import Survey from './Survey';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { absolute: `${SURVEY.title} | OPPO` },
  description: SURVEY.description,
  alternates: { canonical: '/dotaznik' },
  // Shared by link (media, influencers, newsletter); search engines don't need a survey that will close.
  robots: { index: false, follow: true },
  openGraph: { type: 'website', locale: 'cs_CZ', siteName: 'OPPO Česko', title: SURVEY.title, description: SURVEY.description },
  twitter: { card: 'summary_large_image', title: SURVEY.title, description: SURVEY.description },
};

export const viewport: Viewport = { themeColor: '#123b24' };

type Search = Promise<{ src?: string; utm_source?: string }>;

export default async function SurveyPage({ searchParams }: { searchParams: Search }) {
  const { src, utm_source } = await searchParams;
  return <Survey src={cleanSource(src || utm_source)} siteUrl={SITE_URL} logoSrc={img('oppo-logo-white.png')} />;
}
