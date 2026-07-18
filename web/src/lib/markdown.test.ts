import { describe, expect, it } from 'vitest'
import { parse, serialize, type Block } from './markdown'

/**
 * E4-S7: round-trip stability and parity with the reference serializer
 * (`buildMd` in `design/Keepou - Éditeur canonique.dc.html`).
 */

// The mockup's sample content, verbatim.
const SAMPLE_TITLE = 'Repas de quartier'
const SAMPLE_BLOCKS: Block[] = [
  {
    type: 'text',
    text: 'Pour le repas de quartier on se répartit les tâches. RDV samedi 10h sur la place pour installer.',
  },
  { type: 'check', checked: true, text: 'Réserver la salle' },
  { type: 'check', checked: false, text: 'Liste des plats par famille' },
  { type: 'check', checked: false, text: 'Tables & chaises' },
  { type: 'text', text: 'Penser à ramener une rallonge et des gobelets réutilisables.' },
]

/** Reference implementation, copied as-is from the mockup (title embedded as H1). */
function buildMd(title: string, blocks: Block[]): string {
  const lines = ['# ' + title, '']
  let prevCheck = false
  blocks.forEach((b, i) => {
    if (b.type === 'check') {
      if (i > 0 && !prevCheck) lines.push('')
      lines.push((b.checked ? '- [x] ' : '- [ ] ') + b.text)
      prevCheck = true
    } else {
      lines.push('')
      lines.push(b.text)
      prevCheck = false
    }
  })
  return lines.join('\n').replace(/\n{3,}/g, '\n\n')
}

describe('serialize', () => {
  it('matches the mockup buildMd on the sample content (title stored apart)', () => {
    expect(`# ${SAMPLE_TITLE}\n\n${serialize(SAMPLE_BLOCKS)}`).toBe(
      buildMd(SAMPLE_TITLE, SAMPLE_BLOCKS),
    )
  })

  it('puts a blank line between a paragraph and a group of boxes, never two', () => {
    const md = serialize(SAMPLE_BLOCKS)
    expect(md).toBe(
      'Pour le repas de quartier on se répartit les tâches. RDV samedi 10h sur la place pour installer.\n' +
        '\n' +
        '- [x] Réserver la salle\n' +
        '- [ ] Liste des plats par famille\n' +
        '- [ ] Tables & chaises\n' +
        '\n' +
        'Penser à ramener une rallonge et des gobelets réutilisables.',
    )
    expect(md).not.toMatch(/\n{3,}/)
  })

  it('serializes an empty flow to an empty body', () => {
    expect(serialize([])).toBe('')
    expect(serialize([{ type: 'text', text: '' }])).toBe('')
  })
})

describe('round-trip', () => {
  it('parse(serialize(blocks)) preserves the block list', () => {
    expect(parse(serialize(SAMPLE_BLOCKS))).toEqual(SAMPLE_BLOCKS)
  })

  it('checkbox state survives the round-trip', () => {
    const blocks: Block[] = [
      { type: 'check', checked: false, text: 'Tables & chaises' },
      { type: 'check', checked: true, text: 'Réserver la salle' },
      { type: 'check', checked: false, text: '' }, // freshly inserted, unlabeled
    ]
    expect(parse(serialize(blocks))).toEqual(blocks)
  })

  it('is stable on a body that starts with checkboxes', () => {
    const blocks: Block[] = [
      { type: 'check', checked: true, text: 'Pain' },
      { type: 'text', text: 'Voir avec Léa pour le reste.' },
    ]
    expect(serialize(blocks)).toBe('- [x] Pain\n\nVoir avec Léa pour le reste.')
    expect(parse(serialize(blocks))).toEqual(blocks)
  })
})

describe('parse', () => {
  it('tolerates [X] uppercase and missing space after the marker', () => {
    expect(parse('- [X] Fait\n- [ ]')).toEqual([
      { type: 'check', checked: true, text: 'Fait' },
      { type: 'check', checked: false, text: '' },
    ])
  })

  it('keeps blank lines inside a single text block (visible line breaks survive a reopen)', () => {
    expect(parse('ligne 1\nligne 2\n\nsecond paragraphe')).toEqual([
      { type: 'text', text: 'ligne 1\nligne 2\n\nsecond paragraphe' },
    ])
  })

  it('round-trips a paragraph containing a blank line unchanged', () => {
    const blocks: Block[] = [{ type: 'text', text: 'ligne 1\n\nligne 2' }]
    expect(serialize(blocks)).toBe('ligne 1\n\nligne 2')
    expect(parse(serialize(blocks))).toEqual(blocks)
  })

  it('treats blank lines around a checkbox group as separators, not content', () => {
    expect(parse('avant\n\n- [ ] tâche\n\naprès')).toEqual([
      { type: 'text', text: 'avant' },
      { type: 'check', checked: false, text: 'tâche' },
      { type: 'text', text: 'après' },
    ])
  })

  it('normalizes 3+ consecutive blank lines from imported bodies to one', () => {
    expect(parse('a\n\n\n\nb')).toEqual([{ type: 'text', text: 'a\n\nb' }])
  })

  it('parses an empty body to an empty flow', () => {
    expect(parse('')).toEqual([])
  })
})
