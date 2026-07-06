import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NoteOut } from '../api/notes'
import {
  boardKey,
  clearBoardCache,
  getCachedBoard,
  removeCachedNote,
  setCachedBoard,
  subscribeBoards,
  updateCachedBoard,
  upsertCachedNote,
} from './boardCache'

/**
 * Cross-navigation board cache (E11 perf): the store BoardPage reads through
 * useSyncExternalStore and the editor writes back into on save / delete.
 */

function note(id: string, over: Partial<NoteOut> = {}): NoteOut {
  return {
    id,
    title: id,
    body: '',
    color: 'GOLD',
    visibility: 'PRIVATE',
    owner_id: 'u1',
    author_name: 'Marie',
    created_at: '2026-07-01T10:00:00',
    updated_at: '2026-07-01T10:00:00',
    pinned: false,
    archived: false,
    locked_by: null,
    lock_expires_at: null,
    ...over,
  }
}

describe('boardCache', () => {
  afterEach(() => clearBoardCache())

  it('keys boards by tab and archived state', () => {
    expect(boardKey('mine', false)).toBe('mine|active')
    expect(boardKey('mine', true)).toBe('mine|archived')
    expect(boardKey('public', false)).toBe('public|active')
  })

  it('stores and reads a list per key; unknown keys are undefined', () => {
    const key = boardKey('mine', false)
    expect(getCachedBoard(key)).toBeUndefined()
    const list = [note('a'), note('b')]
    setCachedBoard(key, list)
    expect(getCachedBoard(key)).toBe(list)
    expect(getCachedBoard(boardKey('public', false))).toBeUndefined()
  })

  it('notifies subscribers on every change and stops after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeBoards(listener)
    setCachedBoard(boardKey('mine', false), [note('a')])
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    setCachedBoard(boardKey('mine', false), [note('b')])
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('applies an optimistic transform with updateCachedBoard', () => {
    const key = boardKey('mine', false)
    setCachedBoard(key, [note('a'), note('b')])
    updateCachedBoard(key, (list) => list.filter((n) => n.id !== 'a'))
    expect(getCachedBoard(key)?.map((n) => n.id)).toEqual(['b'])
  })

  it('upserts a note only where it is already cached (no blind insert)', () => {
    const mine = boardKey('mine', false)
    const pub = boardKey('public', false)
    setCachedBoard(mine, [note('a', { title: 'old' }), note('b')])
    setCachedBoard(pub, [note('c')])
    upsertCachedNote(note('a', { title: 'new' }))
    expect(getCachedBoard(mine)?.find((n) => n.id === 'a')?.title).toBe('new')
    // 'a' is not in the public list, so it is not inserted there.
    expect(getCachedBoard(pub)?.some((n) => n.id === 'a')).toBe(false)
  })

  it('removes a note from every cached list', () => {
    const mine = boardKey('mine', false)
    const arch = boardKey('mine', true)
    setCachedBoard(mine, [note('a'), note('b')])
    setCachedBoard(arch, [note('a')])
    removeCachedNote('a')
    expect(getCachedBoard(mine)?.map((n) => n.id)).toEqual(['b'])
    expect(getCachedBoard(arch)?.map((n) => n.id)).toEqual([])
  })

  it('clears every board on clearBoardCache', () => {
    setCachedBoard(boardKey('mine', false), [note('a')])
    setCachedBoard(boardKey('public', false), [note('b')])
    clearBoardCache()
    expect(getCachedBoard(boardKey('mine', false))).toBeUndefined()
    expect(getCachedBoard(boardKey('public', false))).toBeUndefined()
  })
})
