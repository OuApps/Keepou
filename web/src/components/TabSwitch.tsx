import type { BoardTab } from '../api/notes'

/**
 * « Mes notes / Public » segmented pill (E3-S4), faithful to the Board mockup.
 * Presentational: the page owns the active tab (driven by `?tab=`).
 */
export function TabSwitch({ tab, onChange }: { tab: BoardTab; onChange: (tab: BoardTab) => void }) {
  return (
    <div className="kp-tabs" role="tablist" aria-label="Tableaux">
      {(
        [
          ['mine', 'Mes notes'],
          ['public', 'Public'],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          className={`kp-tabs__tab${tab === id ? ' kp-tabs__tab--active' : ''}`}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
