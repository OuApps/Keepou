/**
 * Mobile on-screen keyboard handling (E8-S6).
 *
 * The viewport meta (`interactive-widget=resizes-content`) makes Android
 * Chrome shrink the layout viewport under the keyboard, so sticky/in-flow
 * bottom bars (editor footer, mobile history bar, composer) stay visible.
 * iOS Safari keeps the layout viewport tall and only pans — its native
 * anchoring is unreliable — so we also scroll the focused field into view
 * ourselves, once the keyboard animation has settled.
 */

const EDITABLE = 'input, textarea, [contenteditable="true"]'

/** Fields whose focus should never trigger a scroll (checkbox/radio open no keyboard). */
const NO_KEYBOARD = new Set(['checkbox', 'radio', 'button', 'submit', 'range', 'file'])

function scrollFieldIntoView(field: Element) {
  // `block: 'center'` leaves room under the field for its primary button.
  field.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

/** Install the focus → scroll-into-view behavior. Returns a cleanup function. */
export function installKeyboardScroll(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null

  const onFocusIn = (event: FocusEvent) => {
    const target = event.target
    if (!(target instanceof Element) || !target.matches(EDITABLE)) return
    if (target instanceof HTMLInputElement && NO_KEYBOARD.has(target.type)) return
    // Wait for the keyboard/viewport animation before measuring.
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      if (document.activeElement === target) scrollFieldIntoView(target)
    }, 300)
  }

  // When the visual viewport shrinks (keyboard opens) after focus, re-anchor.
  const onViewportResize = () => {
    const active = document.activeElement
    if (active !== null && active.matches(EDITABLE)) scrollFieldIntoView(active)
  }

  document.addEventListener('focusin', onFocusIn)
  window.visualViewport?.addEventListener('resize', onViewportResize)
  return () => {
    if (timer !== null) clearTimeout(timer)
    document.removeEventListener('focusin', onFocusIn)
    window.visualViewport?.removeEventListener('resize', onViewportResize)
  }
}
