'use client';

import { usePathname } from 'next/navigation';

// Pages with their own full-screen look (the survey) render without the contest header and footer.
const BARE = ['/dotaznik'];

export default function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '';
  if (BARE.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
  return <>{children}</>;
}
