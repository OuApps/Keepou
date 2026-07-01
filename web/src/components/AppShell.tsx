import { Outlet } from 'react-router-dom'
import { Topbar } from './Topbar'

/**
 * Layout for authenticated full-page screens (Board, Admin): the shared Topbar
 * plus the centered content container from the mockups (max-width 1320px).
 * The editor and history use their own modal / full-screen shells (E4/E6).
 */
export function AppShell() {
  return (
    <div className="kp-app">
      <Topbar />
      <main className="kp-container">
        <Outlet />
      </main>
    </div>
  )
}
