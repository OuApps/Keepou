import { THEME_COPY } from '../lib/copy'
import { useThemeContext } from '../theme/ThemeProvider'

/**
 * Round theme toggle, faithful to `Keepou - Board.dc.html`:
 * light mode shows the moon (switch to dark), dark mode shows the sun.
 */
export function ThemeToggle() {
  const { theme, toggle } = useThemeContext()
  const isLight = theme === 'light'

  return (
    <button
      type="button"
      className="kp-icon-btn"
      onClick={toggle}
      title={THEME_COPY.title}
      aria-label={isLight ? THEME_COPY.toDark : THEME_COPY.toLight}
    >
      {isLight ? (
        <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
          <path
            d="M16 11.5a6.5 6.5 0 1 1-7.5-9 5 5 0 0 0 7.5 9Z"
            fill="none"
            stroke="#8A7F69"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="4" fill="none" stroke="#EAB64C" strokeWidth="1.6" />
          <g stroke="#EAB64C" strokeWidth="1.6" strokeLinecap="round">
            <line x1="10" y1="2.5" x2="10" y2="4" />
            <line x1="10" y1="16" x2="10" y2="17.5" />
            <line x1="2.5" y1="10" x2="4" y2="10" />
            <line x1="16" y1="10" x2="17.5" y2="10" />
            <line x1="4.6" y1="4.6" x2="5.7" y2="5.7" />
            <line x1="14.3" y1="14.3" x2="15.4" y2="15.4" />
            <line x1="15.4" y1="4.6" x2="14.3" y2="5.7" />
            <line x1="5.7" y1="14.3" x2="4.6" y2="15.4" />
          </g>
        </svg>
      )}
    </button>
  )
}
