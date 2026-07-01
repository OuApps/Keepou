import { useTheme } from './hooks/useTheme'

/**
 * Application shell — E0 skeleton.
 * Used to verify the design system is wired up (tokens, fonts, light/dark theme).
 * The real screens (Board, Editor, History, Auth, Admin) arrive epic by epic
 * via React Router — see EPICS.md and the frontend breakdown in handoff §6.
 */
export default function App() {
  const { theme, toggle } = useTheme()

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '15px 28px',
          background: 'var(--topbar)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-brand)',
            fontWeight: 600,
            fontSize: 23,
            color: 'var(--ink)',
          }}
        >
          Keepou
        </span>
        <span style={{ flex: 1 }} />
        <button
          onClick={toggle}
          style={{
            width: 40,
            height: 40,
            borderRadius: 'var(--r-pill)',
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--ink)',
            cursor: 'pointer',
          }}
          title="Thème"
        >
          {theme === 'light' ? '☾' : '☀'}
        </button>
      </header>

      <main style={{ maxWidth: 1320, margin: '0 auto', padding: '40px 28px', width: '100%' }}>
        <h1 style={{ fontFamily: 'var(--font-brand)', color: 'var(--ink)' }}>Squelette prêt</h1>
        <p style={{ color: 'var(--ink-soft)', maxWidth: 560, lineHeight: 1.6 }}>
          Design system câblé (polices Fredoka / Nunito Sans / IBM Plex Mono, tokens clair +
          sombre). Les écrans sont implémentés epic par epic — voir <code>EPICS.md</code>.
        </p>
      </main>
    </div>
  )
}
