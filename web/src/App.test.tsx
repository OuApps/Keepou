import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('affiche la marque Keepou', () => {
    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>,
    )
    expect(screen.getByText('Keepou')).toBeInTheDocument()
  })

  it('applique data-theme sur <html> au montage', () => {
    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>,
    )
    const theme = document.documentElement.getAttribute('data-theme')
    expect(theme === 'light' || theme === 'dark').toBe(true)
  })
})
