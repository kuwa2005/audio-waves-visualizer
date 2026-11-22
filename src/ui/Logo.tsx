/**
 * ロゴ: 角丸の枠に、中央が高いスペクトラムの棒と、その上を走る波形。
 * public/favicon.svg と同じ図柄（色はアクセントのグラデーション）。
 */
export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Audio Waves Visualizer のロゴ" data-testid="logo">
      <defs>
        <linearGradient id="awv-logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="#0b0d12" />
      <rect x="2" y="2" width="60" height="60" rx="13" fill="none" stroke="url(#awv-logo-g)" strokeWidth="4" />
      <g fill="url(#awv-logo-g)">
        <rect x="12.5" y="27" width="5" height="10" rx="2.5" />
        <rect x="20.5" y="20" width="5" height="24" rx="2.5" />
        <rect x="28.5" y="12" width="5" height="40" rx="2.5" />
        <rect x="36.5" y="18" width="5" height="28" rx="2.5" />
        <rect x="44.5" y="25" width="5" height="14" rx="2.5" />
      </g>
      <path
        d="M7 32c5 0 6-9 11-9s6 18 11 18 6-22 11-22 6 18 11 18 4-5 6-5"
        fill="none"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity=".92"
      />
    </svg>
  );
}

/** 電球アイコン。on = 点灯（ライトモード） */
export function BulbIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      {on && (
        <g stroke="#fbbf24" strokeWidth="1.8" strokeLinecap="round">
          <path d="M12 1.2v1.6M3.6 4.6l1.2 1.1M20.4 4.6l-1.2 1.1M1.4 11.5h1.7M20.9 11.5h1.7" />
        </g>
      )}
      <path
        d="M12 4.2a6.6 6.6 0 0 0-3.9 11.9c.6.5.9 1.1.9 1.8v.6h6v-.6c0-.7.3-1.3.9-1.8A6.6 6.6 0 0 0 12 4.2z"
        fill={on ? "#fde047" : "none"}
        stroke={on ? "#f59e0b" : "currentColor"}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M9.4 20.6h5.2M10.2 22.6h3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      {!on && <path d="M10.3 15.6l1.7-3.4 1.7 3.4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity=".6" />}
    </svg>
  );
}
