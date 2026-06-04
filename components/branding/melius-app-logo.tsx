import { useId } from 'react';

type MeliusAppLogoProps = {
  className?: string;
};

export function MeliusAppLogo({ className }: MeliusAppLogoProps) {
  const id = useId().replaceAll(':', '');
  const steelGradientId = `${id}-steel`;
  const arrowGradientId = `${id}-arrow`;
  const textGradientId = `${id}-wordmark`;
  const cyanGradientId = `${id}-cyan`;
  const glowId = `${id}-glow`;
  const starGlowId = `${id}-star-glow`;

  return (
    <svg
      viewBox="0 0 420 340"
      className={className}
      fill="none"
      role="img"
      aria-label="MeliusAI"
    >
      <title>MeliusAI</title>
      <desc>Geometric M monogram with an ascending arrow and audit spark.</desc>
      <defs>
        <linearGradient id={steelGradientId} x1="111" y1="65" x2="286" y2="210" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8caac1" />
          <stop offset="0.27" stopColor="#62839e" />
          <stop offset="0.62" stopColor="#365779" />
          <stop offset="1" stopColor="#7194ad" />
        </linearGradient>
        <linearGradient id={arrowGradientId} x1="171" y1="178" x2="302" y2="31" gradientUnits="userSpaceOnUse">
          <stop stopColor="#315475" />
          <stop offset="0.48" stopColor="#527795" />
          <stop offset="1" stopColor="#afc5d6" />
        </linearGradient>
        <linearGradient id={textGradientId} x1="72" y1="294" x2="302" y2="249" gradientUnits="userSpaceOnUse">
          <stop stopColor="#88a6bf" />
          <stop offset="0.42" stopColor="#c1d1dc" />
          <stop offset="1" stopColor="#6e90ab" />
        </linearGradient>
        <linearGradient id={cyanGradientId} x1="313" y1="245" x2="374" y2="298" gradientUnits="userSpaceOnUse">
          <stop stopColor="#25e5ee" />
          <stop offset="1" stopColor="#13bbd4" />
        </linearGradient>
        <filter id={glowId} x="-26%" y="-26%" width="152%" height="152%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
        <filter id={starGlowId} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
      </defs>

      <path
        d="M167 167 188 188 260 116 279 134 304 30 204 64 224 84Z"
        fill="#1595ba"
        opacity="0.18"
        filter={`url(#${glowId})`}
      />

      <path
        d="M91 207V62H130L204 136 278 62H316V207H272V118L204 188 135 119V207H91Z"
        fill={`url(#${steelGradientId})`}
        stroke="#7da2bc"
        strokeWidth="3.2"
        strokeLinejoin="miter"
      />
      <path
        d="M99 199V70H126L204 147 282 70H308V199"
        stroke="#bdd1dd"
        strokeWidth="2"
        opacity="0.32"
      />
      <path d="M279 197V122L307 94V197H279Z" fill="#adc4d3" opacity="0.16" />

      <path
        d="M167 167 188 188 260 116 279 134 304 30 204 64 224 84Z"
        fill={`url(#${arrowGradientId})`}
        stroke="#82a6c0"
        strokeWidth="3.4"
        strokeLinejoin="miter"
      />
      <path
        d="M177 167 188 178 259 107 271 119 291 45 219 70 232 83Z"
        fill="#9db7ca"
        opacity="0.12"
      />
      <path d="M209 66 298 36 277 126" stroke="#d0dce5" strokeWidth="2" opacity="0.18" />

      <path
        d="M225 73 231 96 254 102 231 108 225 131 219 108 196 102 219 96Z"
        fill="#22d3ee"
        opacity="0.34"
        filter={`url(#${starGlowId})`}
      />
      <path
        d="M225 70 231 95.5 257 102 231 108.5 225 134 219 108.5 193 102 219 95.5Z"
        fill="#26e4ea"
      />
      <path
        d="M225 82V122M205 102h40M211 88l28 28M239 88l-28 28"
        stroke="#a5f3fc"
        strokeWidth="1.25"
        opacity="0.72"
      />

      <text
        x="210"
        y="292"
        textAnchor="middle"
        fontFamily="Inter, sans-serif"
        fontSize="55"
        fontWeight="800"
        letterSpacing="3.4"
      >
        <tspan fill={`url(#${textGradientId})`}>MELIUS</tspan>
        <tspan dx="13" fill={`url(#${cyanGradientId})`}>AI</tspan>
      </text>
    </svg>
  );
}
