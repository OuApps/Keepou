import { type ReactNode } from 'react'

/**
 * Inline auth message (mockup « Variantes de message »): terracotta error
 * (bad credentials) or gold notice (disabled account). Icons are inline SVGs
 * — no decorative emoji in the chrome (design/claude.md).
 */
export function AuthMessage({
  variant,
  children,
}: {
  variant: 'error' | 'warning'
  children: ReactNode
}) {
  return (
    <div className={`kp-auth__msg kp-auth__msg--${variant}`} role="alert">
      {variant === 'error' ? (
        <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10 6 V10.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <circle cx="10" cy="13.6" r="1" fill="currentColor" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M8 6.8 V13.2 M12 6.8 V13.2"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      )}
      <span>{children}</span>
    </div>
  )
}
