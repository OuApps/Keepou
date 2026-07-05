import { describe, expect, it } from 'vitest'
import { parseHeading, parseInline, type InlineSegment } from './inline'

/**
 * E8-S9: the bounded inline subset — bold `**`, italic `*`, headings `#`–`###`.
 * Everything else must stay literal, and `raw` slices must concatenate back to
 * the input (the editing surface is a lossless view over the Markdown).
 */

const rawOf = (segments: InlineSegment[]) => segments.map((s) => s.raw).join('')

describe('parseInline', () => {
  it('recognizes **bold** with its markers preserved in raw', () => {
    expect(parseInline('du **gras** ici')).toEqual([
      { kind: 'plain', text: 'du ', raw: 'du ' },
      { kind: 'bold', text: 'gras', raw: '**gras**' },
      { kind: 'plain', text: ' ici', raw: ' ici' },
    ])
  })

  it('recognizes *italic*', () => {
    expect(parseInline("de l'*italique*")).toEqual([
      { kind: 'plain', text: "de l'", raw: "de l'" },
      { kind: 'italic', text: 'italique', raw: '*italique*' },
    ])
  })

  it('handles bold and italic on the same line', () => {
    expect(parseInline('**gras** et *italique*')).toEqual([
      { kind: 'bold', text: 'gras', raw: '**gras**' },
      { kind: 'plain', text: ' et ', raw: ' et ' },
      { kind: 'italic', text: 'italique', raw: '*italique*' },
    ])
  })

  it('leaves unmatched markers literal', () => {
    // A single `*` (or an unclosed `**`) stays plain text.
    expect(parseInline('2 * 3 = 6')).toEqual([
      { kind: 'plain', text: '2 * 3 = 6', raw: '2 * 3 = 6' },
    ])
    expect(parseInline('**pas fermé')).toEqual([
      { kind: 'plain', text: '**pas fermé', raw: '**pas fermé' },
    ])
  })

  it('keeps other Markdown literal (no full GFM)', () => {
    const line = '_souligné_ `code` [lien](url) > citation'
    expect(parseInline(line)).toEqual([{ kind: 'plain', text: line, raw: line }])
  })

  it('raw slices always concatenate back to the input', () => {
    for (const line of [
      'du **gras** et *italique* mêlés **deux** fois',
      '***trois étoiles***',
      '*a **b** c*',
      '**',
      '',
    ]) {
      expect(rawOf(parseInline(line))).toBe(line)
    }
  })
})

describe('parseHeading', () => {
  it('recognizes # ## ### with a space', () => {
    expect(parseHeading('# Titre')).toEqual({ level: 1, marker: '# ', text: 'Titre' })
    expect(parseHeading('## Sous-titre')).toEqual({ level: 2, marker: '## ', text: 'Sous-titre' })
    expect(parseHeading('### Détail')).toEqual({ level: 3, marker: '### ', text: 'Détail' })
  })

  it('rejects deeper levels, missing space, and mid-line hashes', () => {
    expect(parseHeading('#### Trop profond')).toBeNull()
    expect(parseHeading('#Sans espace')).toBeNull()
    expect(parseHeading('pas un # titre')).toBeNull()
  })

  it('never turns a checkbox line into a heading (blocks stay untouched)', () => {
    expect(parseHeading('- [ ] tâche')).toBeNull()
    expect(parseHeading('- [x] fait')).toBeNull()
  })
})
