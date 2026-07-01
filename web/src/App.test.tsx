import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the Keepou brand', () => {
    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>,
    )
    expect(screen.getByText('Keepou')).toBeInTheDocument()
  })

  it('applies data-theme on <html> on mount', () => {
    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>,
    )
    const theme = document.documentElement.getAttribute('data-theme')
    expect(theme === 'light' || theme === 'dark').toBe(true)
  })
})
