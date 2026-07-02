import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders the login screen on /login', () => {
    renderAt('/login')
    expect(screen.getByRole('heading', { name: 'Keepou' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeInTheDocument()
  })

  it('redirects unauthenticated users from a guarded route to login', () => {
    renderAt('/')
    // No token → RequireAuth bounces / to the login screen.
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeInTheDocument()
  })

  it('applies data-theme on <html> on mount', () => {
    renderAt('/login')
    const theme = document.documentElement.getAttribute('data-theme')
    expect(theme === 'light' || theme === 'dark').toBe(true)
  })
})
