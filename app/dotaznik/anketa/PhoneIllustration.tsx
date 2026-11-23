// Brandless product-style illustration: today's tall phone next to the wider format.
// Shown on the poll until real photos are added to public/img/anketa/.

type Props = { className?: string; compact?: boolean };

function Phone({ x, y, w, h, r, id, clock }: { x: number; y: number; w: number; h: number; r: number; id: string; clock: boolean }) {
  const bezel = Math.max(6, w * 0.035);
  const sx = x + bezel;
  const sy = y + bezel;
  const sw = w - bezel * 2;
  const sh = h - bezel * 2;
  return (
    <g>
      {/* soft floor shadow */}
      <ellipse cx={x + w / 2} cy={y + h + 26} rx={w * 0.46} ry={9} fill="#0e1a13" opacity="0.13" filter={`url(#blur-${id})`} />
      {/* aluminium frame */}
      <rect x={x} y={y} width={w} height={h} rx={r} fill={`url(#frame-${id})`} />
      <rect x={x + 1.5} y={y + 1.5} width={w - 3} height={h - 3} rx={r - 1.5} fill="none" stroke="#ffffff" strokeOpacity="0.28" strokeWidth="1.5" />
      {/* screen */}
      <rect x={sx} y={sy} width={sw} height={sh} rx={r - bezel} fill={`url(#screen-${id})`} />
      <rect x={sx} y={sy} width={sw} height={sh} rx={r - bezel} fill={`url(#glare-${id})`} />
      {/* camera */}
      <circle cx={x + w / 2} cy={sy + 18} r={6} fill="#0b0f0d" />
      <circle cx={x + w / 2 - 1.6} cy={sy + 16.4} r={1.6} fill="#3b4a42" />
      {clock && (
        <text x={x + w / 2} y={sy + sh * 0.3} textAnchor="middle" fill="#ffffff" fontSize={sw * 0.16} fontWeight={300} letterSpacing="-1">
          12:30
        </text>
      )}
      {/* side buttons */}
      <rect x={x + w - 1} y={y + h * 0.2} width={3.5} height={h * 0.09} rx={1.6} fill="#9aa39d" />
      <rect x={x + w - 1} y={y + h * 0.33} width={3.5} height={h * 0.06} rx={1.6} fill="#9aa39d" />
      <defs>
        <linearGradient id={`frame-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d9dfdb" />
          <stop offset="0.45" stopColor="#a9b2ac" />
          <stop offset="1" stopColor="#7d8781" />
        </linearGradient>
        <linearGradient id={`screen-${id}`} x1="0" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#163e28" />
          <stop offset="0.55" stopColor="#2d683d" />
          <stop offset="1" stopColor="#a8f0c0" />
        </linearGradient>
        <linearGradient id={`glare-${id}`} x1="0" y1="0" x2="1" y2="0.6">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.16" />
          <stop offset="0.45" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <filter id={`blur-${id}`} x="-20%" y="-200%" width="140%" height="500%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>
    </g>
  );
}

export default function PhoneIllustration({ className, compact }: Props) {
  // Same height for both, so the difference reads as width: 9:19.5 vs. a passport-like 1:1.38.
  const h = compact ? 300 : 360;
  const tallW = Math.round(h / 2.17);
  const wideW = Math.round(h / 1.38);
  const gap = 56;
  const pad = 40;
  const width = pad * 2 + tallW + gap + wideW;
  return (
    <svg className={className} viewBox={`0 0 ${width} ${h + 90}`} role="img" aria-label="Ilustrace: dnešní úzký telefon vedle širšího formátu">
      <Phone id="tall" x={pad} y={20} w={tallW} h={h} r={26} clock={false} />
      <Phone id="wide" x={pad + tallW + gap} y={20} w={wideW} h={h} r={30} clock />
      <g fontSize="14" fill="#5b675f" textAnchor="middle">
        <text x={pad + tallW / 2} y={h + 82}>Dnešní telefon</text>
        <text x={pad + tallW + gap + wideW / 2} y={h + 82}>Širší formát</text>
      </g>
    </svg>
  );
}
