import type { BoardTab } from '../api/notes'
import { useI18n } from '../i18n'

/**
 * « Mes notes / Public » segmented pill (E3-S4), faithful to the Board mockup.
 * Presentational: the page owns the active tab (driven by `?tab=`).
 */
export function TabSwitch({ tab, onChange }: { tab: BoardTab; onChange: (tab: BoardTab) => void }) {
  const { BOARD_COPY } = useI18n()
  return (
    <div className="kp-tabs" role="tablist" aria-label={BOARD_COPY.tablistLabel}>
      {(
        [
          ['mine', BOARD_COPY.tabMine],
          ['public', BOARD_COPY.tabPublic],
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
