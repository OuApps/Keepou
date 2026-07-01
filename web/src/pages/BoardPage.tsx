/**
 * Board — placeholder (E3). Doubles as the E0 design-system reference: it renders
 * the shell (Topbar via AppShell) plus one sample card per shade so the tokens,
 * fonts and light/dark theme can be eyeballed. The real board (tabs, composer,
 * live notes) lands in E3.
 */

const SHADES = [
  { id: 'gold', bg: 'var(--c-gold)', bd: 'var(--c-gold-bd)', title: 'Courses du week-end' },
  { id: 'salsa', bg: 'var(--c-salsa)', bd: 'var(--c-salsa-bd)', title: 'Idées déco salon' },
  { id: 'avocat', bg: 'var(--c-avo)', bd: 'var(--c-avo-bd)', title: 'Repas de quartier' },
  { id: 'clay', bg: 'var(--c-clay)', bd: 'var(--c-clay-bd)', title: 'Notes de lecture' },
  { id: 'teal', bg: 'var(--c-teal)', bd: 'var(--c-teal-bd)', title: 'Vacances d’été' },
] as const

export default function BoardPage() {
  return (
    <section>
      <p className="kp-tag">E3 · Board</p>
      <h1 className="kp-title" style={{ fontSize: 26, marginBottom: 8 }}>
        Mes notes
      </h1>
      <p className="kp-muted" style={{ marginBottom: 26 }}>
        Écran de référence du design system (tokens, polices, thème clair/sombre). Le board complet
        — onglets Mes notes / Public, composer, cartes réelles — arrive en E3.
      </p>

      <div style={{ columnCount: 4, columnGap: 18 }} className="kp-demo-grid">
        {SHADES.map((s) => (
          <div
            key={s.id}
            className="kp-card"
            style={{
              margin: '0 0 18px',
              borderRadius: 'var(--r-card)',
              padding: 16,
              background: s.bg,
              border: `1px solid ${s.bd}`,
              boxShadow: 'var(--sh-card)',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-brand)',
                fontWeight: 600,
                fontSize: 16,
                color: 'var(--ink)',
                marginBottom: 6,
              }}
            >
              {s.title}
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-soft)' }}>
              Exemple de carte « {s.id} » pour vérifier les dégradés et bordures.
            </div>
            <div style={{ marginTop: 12, fontSize: 11.5, color: 'var(--ink-mute)' }}>
              Privé · exemple
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
