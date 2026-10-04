import type { CompanyMeta } from '../types';

// Vector identity badges. These are simplified, brand-coloured glyphs drawn for this terminal (not the issuers'
// official artwork): a geometric mark per company plus its short ticker monogram.

function Glyph({ meta }: { meta: CompanyMeta }) {
  const { fg } = meta.brand;
  switch (meta.brand.glyph) {
    case 'three-diamonds':
      // Three rhombi radiating from the centre (Mitsubishi group style).
      return (
        <g fill={fg}>
          <path d="M20 20 L16.2 13.4 L20 6.8 L23.8 13.4 Z" />
          <path d="M20 20 L12.4 20 L8.6 26.6 L16.2 26.6 Z" />
          <path d="M20 20 L27.6 20 L31.4 26.6 L23.8 26.6 Z" />
        </g>
      );
    case 'ellipses':
      return (
        <g fill="none" stroke={fg} strokeWidth="2">
          <ellipse cx="20" cy="20" rx="13" ry="8.5" />
          <ellipse cx="20" cy="17" rx="5" ry="5.5" />
          <ellipse cx="20" cy="18.5" rx="10" ry="3.2" />
        </g>
      );
    case 'wave':
      return (
        <g fill="none" strokeLinecap="round" strokeWidth="2.6">
          <path d="M8 24 C13 14, 19 14, 22 20 S30 26, 33 15" stroke={fg} />
          <path d="M8 29 C13 22, 19 22, 22 26 S30 30, 33 22" stroke="#FFFFFF" opacity="0.85" />
        </g>
      );
    case 'ring':
      return (
        <g>
          <circle cx="20" cy="20" r="11" fill="none" stroke={fg} strokeWidth="3" />
          <circle cx="20" cy="20" r="3.5" fill={fg} />
        </g>
      );
    case 'chip':
      return (
        <g fill="none" stroke={fg} strokeWidth="1.8">
          <rect x="12" y="12" width="16" height="16" rx="2" />
          <rect x="16" y="16" width="8" height="8" fill={fg} />
          {[15, 20, 25].map((p) => (
            <g key={p}>
              <line x1={p} y1="7" x2={p} y2="12" />
              <line x1={p} y1="28" x2={p} y2="33" />
              <line x1="7" y1={p} x2="12" y2={p} />
              <line x1="28" y1={p} x2="33" y2={p} />
            </g>
          ))}
        </g>
      );
    case 'flame':
      return <path d="M20 7 C25 14, 29 18, 27 25 C25.5 30, 22 32, 20 32 C16 32, 12.5 29, 13 24 C13.5 20, 17 18, 17 13 C19 15, 20 17, 20 19 C22 16, 22 11, 20 7 Z" fill={fg} />;
    case 'mountain':
      return (
        <g>
          <path d="M5 31 L15 14 L21 23 L26 16 L35 31 Z" fill={fg} />
          <path d="M15 14 L18 19 L12.5 19 Z" fill="#FFFFFF" opacity="0.8" />
        </g>
      );
    case 'gear':
      return (
        <g fill={fg}>
          {Array.from({ length: 8 }, (_, i) => (
            <rect key={i} x="18" y="6" width="4" height="6" rx="1" transform={`rotate(${i * 45} 20 20)`} />
          ))}
          <circle cx="20" cy="20" r="9" />
          <circle cx="20" cy="20" r="3.5" fill={meta.brand.bg} />
        </g>
      );
    case 'ship':
      return (
        <g fill={fg}>
          <path d="M6 24 L34 24 L30 31 L10 31 Z" />
          <rect x="11" y="17" width="5" height="6" />
          <rect x="17" y="15" width="5" height="8" />
          <rect x="23" y="17" width="5" height="6" />
        </g>
      );
    case 'bolt':
      return (
        <g>
          <circle cx="20" cy="20" r="12" fill="none" stroke={fg} strokeWidth="1.6" />
          <path d="M22 8 L13 22 L19 22 L17 32 L27 17 L21 17 Z" fill={fg} />
        </g>
      );
    case 'monogram':
    default:
      return null;
  }
}

export function CompanyLogo({ meta, size = 28 }: { meta: CompanyMeta; size?: number }) {
  const mono = meta.brand.glyph === 'monogram';
  const mark = meta.brand.mark;
  const fontSize = mark.length >= 3 ? 11 : mark.length === 2 ? 14 : 18;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={`${meta.name} logo`} className="shrink-0">
      <rect width="40" height="40" rx="8" fill={meta.brand.bg} />
      <rect x="0.5" y="0.5" width="39" height="39" rx="7.5" fill="none" stroke="#ffffff" strokeOpacity="0.12" />
      {mono ? (
        <text
          x="20"
          y="21"
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="Inter, Arial, sans-serif"
          fontWeight="800"
          fontSize={fontSize}
          fill={meta.brand.fg}
          letterSpacing="-0.5"
        >
          {mark}
        </text>
      ) : (
        <Glyph meta={meta} />
      )}
    </svg>
  );
}
