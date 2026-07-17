import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { installKeyboardScroll } from './lib/keyboard'
import './styles/global.css'

// Canonical-origin guard: if the app is ever reached on the default Railway
// domain (`*.up.railway.app`) instead of the public Cloudflare host, bounce to
// the canonical origin before anything else runs — no API call from the wrong
// origin (which would be a CORS miss) and no bookmark on the internal domain.
if (window.location.hostname.endsWith('.up.railway.app')) {
  const { pathname, search, hash } = window.location
  window.location.replace('https://keepou.galaxou.com' + pathname + search + hash)
}

installKeyboardScroll()

// PWA (E8-S1): app-shell service worker, production only — the dev server
// serves everything live and a SW would only get in the way.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js')
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
