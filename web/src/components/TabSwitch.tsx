import type { BoardTab } from '../api/notes'
import { BOARD_COPY } from '../lib/copy'

/**
 * « Tout / Mes notes / Public » segmented pill (E3-S4, extended). Sits under the
 * composer on the board and owns the active board (driven by `?tab=`): « Tout »
 * (default) = own notes + every member's public note; « Mes notes » = own only;
 * « Public » = all public. Presentational — the page owns the value.
 */
export function TabSwitch({ tab, onChange }: { tab: BoardTab; onChange: (tab: BoardTab) => void }) {
  return (
    <div className="kp-tabs" role="tablist" aria-label={BOARD_COPY.tablistLabel}>
      {(
        [
          ['all', BOARD_COPY.tabAll],
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
