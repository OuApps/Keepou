import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { highlightMarkdown } from '../../lib/highlight'
import { MarkdownArea } from './MarkdownArea'

/**
 * E8-S9: the Markdown-aware editing surface. The invariant under test is that
 * the styled DOM is a lossless view over the raw Markdown (textContent ===
 * value), that formatting spans appear as you type, and that the markers stay
 * visible (dimmed) — no toolbar, no selection step.
 */

describe('highlightMarkdown', () => {
  it('textContent round-trips exactly (markers kept in the DOM)', () => {
    const host = document.createElement('div')
    for (const md of [
      'du **gras** et *italique*',
      '# Titre\ncorps de texte',
      '## Sous-titre\n\n### Détail',
      'ligne 1\nligne 2\n',
      '**pas fermé et 2 * 3',
      '',
    ]) {
      host.innerHTML = highlightMarkdown(md)
      expect(host.textContent).toBe(md)
    }
  })

  it('wraps bold, italic and heading runs in styling spans', () => {
    const host = document.createElement('div')
    host.innerHTML = highlightMarkdown('# Titre\n**gras** et *italique*')
    expect(host.querySelector('.kp-md__h.kp-md__h1')?.textContent).toBe('# Titre')
    expect(host.querySelector('.kp-md__b')?.textContent).toBe('**gras**')
    expect(host.querySelector('.kp-md__i')?.textContent).toBe('*italique*')
    // The markers are separate (dimmed) spans inside the run.
    expect(host.querySelectorAll('.kp-md__b .kp-md__mark')).toHaveLength(2)
  })

  it('escapes HTML in the note text', () => {
    const host = document.createElement('div')
    host.innerHTML = highlightMarkdown('<script>alert(1)</script> & **<b>**')
    expect(host.querySelector('script')).toBeNull()
    expect(host.querySelector('b')).toBeNull()
    expect(host.textContent).toBe('<script>alert(1)</script> & **<b>**')
  })
})

/** Place the caret at the end of the surface (jsdom has no real caret). */
function caretToEnd(area: Element) {
  const range = document.createRange()
  range.selectNodeContents(area)
  range.collapse(false)
  const selection = window.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
}

function Harness({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial)
  return (
    <I18nProvider>
      <MarkdownArea value={value} onChange={setValue} onFlush={() => {}} blockKey="blk-test" />
    </I18nProvider>
  )
}

describe('MarkdownArea', () => {
  it('applies bold formatting as you type, keeping the raw Markdown', () => {
    render(<Harness initial="" />)
    const area = screen.getByLabelText('Paragraphe')

    area.textContent = 'liste **importante** du jour'
    fireEvent.input(area)

    // Styled run appeared without any toolbar/selection step…
    expect(area.querySelector('.kp-md__b')?.textContent).toBe('**importante**')
    // …and the underlying text is still the exact Markdown.
    expect(area.textContent).toBe('liste **importante** du jour')
  })

  it('turns a `# ` line into a styled heading as you type', () => {
    render(<Harness initial="# Courses" />)
    const area = screen.getByLabelText('Paragraphe')
    expect(area.querySelector('.kp-md__h1')?.textContent).toBe('# Courses')
  })

  it('Enter splices a newline into the Markdown instead of inserting <br>', () => {
    render(<Harness initial="ligne 1" />)
    const area = screen.getByLabelText('Paragraphe')
    area.focus()
    caretToEnd(area)
    fireEvent.keyDown(area, { key: 'Enter' })
    expect(area.textContent).toBe('ligne 1\n')
  })

  it('paste inserts plain text only', () => {
    render(<Harness initial="avant " />)
    const area = screen.getByLabelText('Paragraphe')
    area.focus()
    caretToEnd(area)
    fireEvent.paste(area, {
      clipboardData: { getData: vi.fn().mockReturnValue('collé **brut**') },
    })
    expect(area.textContent).toBe('avant collé **brut**')
    // The pasted markdown is then highlighted like typed markdown.
    expect(area.querySelector('.kp-md__b')?.textContent).toBe('**brut**')
  })
})
