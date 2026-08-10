export function MonkeyMascot({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 44"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="mascot"
    >
      <circle cx="10" cy="18" r="6" fill="#8a5a3a" />
      <circle cx="34" cy="18" r="6" fill="#8a5a3a" />
      <path
        d="M32 36 C 38 36, 40 28, 40 18"
        stroke="#8a5a3a"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
      <rect x="33" y="2" width="14" height="6" rx="3" fill="#ff4d3d" />
      <rect x="37" y="4" width="6" height="16" rx="2" fill="#232323" />
      <rect x="33" y="16" width="14" height="6" rx="3" fill="#ff4d3d" />
      <circle cx="40" cy="12" r="4.5" fill="#8a5a3a" />
      <circle cx="22" cy="26" r="14" fill="#8a5a3a" />
      <ellipse cx="22" cy="29" rx="8.5" ry="7" fill="#f2c89a" />
      <circle cx="18.5" cy="24" r="1.6" fill="#241a12" />
      <circle cx="25.5" cy="24" r="1.6" fill="#241a12" />
      <circle cx="20" cy="29" r="0.8" fill="#241a12" />
      <circle cx="24" cy="29" r="0.8" fill="#241a12" />
      <path
        d="M18 33 Q22 36 26 33"
        stroke="#241a12"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
