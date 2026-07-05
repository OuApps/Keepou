import { parseHeading, parseInline } from './inline'

/**
 * Markdown → styled HTML for the editing surface (E8-S9). The output's
 * textContent round-trips EXACTLY to the input: highlighting only wraps
 * slices in styling `<span>`s, with the Markdown markers kept visible
 * (dimmed) so the surface stays a lossless view over the stored GFM.
 */

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function inlineHtml(line: string): string {
  return parseInline(line)
    .map((segment) => {
      if (segment.kind === 'bold') {
        return `<span class="kp-md__b"><span class="kp-md__mark">**</span>${escapeHtml(
          segment.text,
        )}<span class="kp-md__mark">**</span></span>`
      }
      if (segment.kind === 'italic') {
        return `<span class="kp-md__i"><span class="kp-md__mark">*</span>${escapeHtml(
          segment.text,
        )}<span class="kp-md__mark">*</span></span>`
      }
      return escapeHtml(segment.text)
    })
    .join('')
}

export function highlightMarkdown(md: string): string {
  const html = md
    .split('\n')
    .map((line) => {
      const heading = parseHeading(line)
      if (heading === null) return inlineHtml(line)
      return `<span class="kp-md__h kp-md__h${heading.level}"><span class="kp-md__mark">${escapeHtml(
        heading.marker,
      )}</span>${inlineHtml(heading.text)}</span>`
    })
    .join('\n')
  // A trailing newline only renders as an (empty) last line with a <br>;
  // <br> is invisible to textContent, so the round-trip stays exact.
  return md.endsWith('\n') ? `${html}<br>` : html
}
