import { describe, expect, it } from 'vitest'
import { formatRelative, formatVersionWhen } from './time'

/**
 * E11-S1 (#12): dates outside the current year carry the year, so imported Keep
 * notes (years old) read right instead of looking like they were touched this
 * year. Recent / same-year dates are unchanged.
 */
describe('year in dates (E11)', () => {
  const now = new Date('2026-07-06T12:00:00Z')

  it('omits the year for a same-year date on the card meta', () => {
    // « le 10 janvier » — no 4-digit year.
    expect(formatRelative('2026-01-10T09:00:00', now)).not.toMatch(/\d{4}/)
  })

  it('adds the year for an older date (imported Keep note)', () => {
    expect(formatRelative('2020-09-13T09:00:00', now)).toContain('2020')
  })

  it('leaves recent relative labels untouched', () => {
    expect(formatRelative('2026-07-06T11:59:40', now)).toBe("à l'instant")
    expect(formatRelative('2026-07-05T12:00:00', now)).toBe('hier')
  })

  it('adds the year to old history timestamps too', () => {
    expect(formatVersionWhen('2019-03-02T08:30:00', now)).toContain('2019')
    expect(formatVersionWhen('2026-02-02T08:30:00', now)).not.toMatch(/\d{4}/)
  })
})
