import type { Block } from '../../lib/markdown'

/**
 * Editing blocks (E4-S4): the serialized `Block` plus a stable client-side id,
 * so React keys survive insertions/removals and focus can follow a new box.
 */
export type EditorBlock = Block & { id: string }

let seq = 0

export function blockId(): string {
  seq += 1
  return `blk-${seq}`
}

export function withIds(blocks: Block[]): EditorBlock[] {
  return blocks.map((block) => ({ ...block, id: blockId() }))
}
