import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { SITE_URL } from '@/lib/config';
import { SURVEY } from '@/lib/survey';

// Share preview for /dotaznik: the survey's own look, a phone that has just widened.
export const alt = `${SURVEY.title} Dotazník OPPO`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Nothing here depends on the request, so the image is rendered once at build time,
// where public/ is on disk (unlike in serverless functions at runtime).
export const dynamic = 'force-static';

async function asset(path: string) {
  return readFile(join(process.cwd(), 'public', path));
}

const MINT = '#a8f0c0';

export default async function Image() {
  const [medium, bold, logo] = await Promise.all([
    asset('/fonts/og/OPPOSans-500.ttf'),
    asset('/fonts/og/OPPOSans-700.ttf'),
    asset('/img/oppo-logo-white.png'),
  ]);
  const logoSrc = `data:image/png;base64,${Buffer.from(logo).toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          fontFamily: 'OPPO Sans',
          color: '#f2fbf5',
          background: 'radial-gradient(circle at 18% 30%, #1f5a37 0%, #123b24 55%)',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} alt="" height={30} style={{ position: 'absolute', left: 72, top: 64, height: 30 }} />

        {/* today's phone, faint, and the wide one in front of it */}
        <div style={{ position: 'absolute', left: 92, top: 168, width: 150, height: 318, border: '4px solid rgba(242,251,245,0.22)', borderRadius: 34, display: 'flex' }} />
        <div
          style={{
            position: 'absolute',
            left: 150,
            top: 168,
            width: 236,
            height: 318,
            border: `5px solid ${MINT}`,
            borderRadius: 40,
            boxShadow: '0 0 90px rgba(168,240,192,0.35)',
            display: 'flex',
            justifyContent: 'center',
            background: '#123b24',
          }}
        >
          <div style={{ width: 16, height: 16, borderRadius: 8, background: MINT, marginTop: 18 }} />
        </div>

        <div style={{ position: 'absolute', left: 470, top: 150, right: 72, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1, letterSpacing: -3 }}>Co když bude</div>
          <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1.05, letterSpacing: -3 }}>telefon širší?</div>
          <div style={{ fontSize: 32, fontWeight: 500, marginTop: 30, color: '#cfe6d6' }}>{`Dotazník OPPO. Stačí zaklikávat, max. ${SURVEY.minutes} minut.`}</div>
          <div style={{ display: 'flex', marginTop: 44 }}>
            <div
              style={{
                height: 64,
                padding: '0 32px',
                borderRadius: 32,
                background: MINT,
                color: '#0f2e1c',
                fontSize: 28,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {`${SITE_URL.replace(/^https?:\/\/(www\.)?/, '')}/dotaznik`}
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'OPPO Sans', data: medium, weight: 500, style: 'normal' },
        { name: 'OPPO Sans', data: bold, weight: 700, style: 'normal' },
      ],
    },
  );
}
