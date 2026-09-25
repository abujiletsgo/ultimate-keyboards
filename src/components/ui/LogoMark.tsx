/** In-app logo mark: the same split-keyboard glyph as the app icon, teal thumbs. */
export default function LogoMark({ size = 16, color = 'currentColor', accent = 'var(--accent, #2dd4bf)' }: { size?: number; color?: string; accent?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true" focusable="false">
      <g fill={color}>
        <rect x="3" y="12" width="4" height="4" rx="1" /><rect x="8" y="10" width="4" height="4" rx="1" /><rect x="13" y="8" width="4" height="4" rx="1" />
        <rect x="3" y="17" width="4" height="4" rx="1" /><rect x="8" y="15" width="4" height="4" rx="1" /><rect x="13" y="13" width="4" height="4" rx="1" />
        <rect x="3" y="22" width="4" height="4" rx="1" /><rect x="8" y="20" width="4" height="4" rx="1" /><rect x="13" y="18" width="4" height="4" rx="1" />
        <rect x="19" y="8" width="4" height="4" rx="1" /><rect x="24" y="10" width="4" height="4" rx="1" /><rect x="29" y="12" width="4" height="4" rx="1" />
        <rect x="19" y="13" width="4" height="4" rx="1" /><rect x="24" y="15" width="4" height="4" rx="1" /><rect x="29" y="17" width="4" height="4" rx="1" />
        <rect x="19" y="18" width="4" height="4" rx="1" /><rect x="24" y="20" width="4" height="4" rx="1" /><rect x="29" y="22" width="4" height="4" rx="1" />
      </g>
      <g fill={accent}>
        <rect x="11" y="26" width="6" height="4" rx="1.5" transform="rotate(12 14 28)" />
        <rect x="19" y="26" width="6" height="4" rx="1.5" transform="rotate(-12 22 28)" />
      </g>
    </svg>
  )
}
