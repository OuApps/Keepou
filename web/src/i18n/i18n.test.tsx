import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { I18nProvider, useI18n, useLocale } from './index'

/** A tiny consumer that shows a string and can flip the locale. */
function Probe() {
  const { AUTH_COPY } = useI18n()
  const { locale, setLocale } = useLocale()
  return (
    <div>
      <span data-testid="label">{AUTH_COPY.signIn}</span>
      <button onClick={() => setLocale(locale === 'fr' ? 'en' : 'fr')}>toggle</button>
    </div>
  )
}

describe('i18n', () => {
  it('renders the reference locale (French) by default and switches to English', () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    )
    // setup.ts pins navigator.language to fr-FR → French is the default.
    expect(screen.getByTestId('label').textContent).toBe('Se connecter')

    fireEvent.click(screen.getByText('toggle'))
    expect(screen.getByTestId('label').textContent).toBe('Sign in')
    // The switch is persisted for the next boot.
    expect(localStorage.getItem('keepou.language')).toBe('en')
  })
})
