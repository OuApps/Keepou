# ADR-0001 — Next.js full-stack + PWA

**Status:** Accepted · **Date:** 2026-06-26

## Context

Keepou needs a UI and an API, must be installable on mobile and desktop
(responsive PWA), and must be **trivial to self-host** (one deployable artifact).
The team is small and wants minimal moving parts.

## Decision

Build the whole app as a **single Next.js (App Router) + TypeScript** project:
- UI with React Server/Client Components.
- API as Next.js **Route Handlers** in the same project.
- Ship as a **PWA** (web app manifest + service worker).

## Consequences

- ✅ One repo, one build, one service to deploy and operate.
- ✅ SSR gives fast first paint; Route Handlers keep the API colocated and typed.
- ✅ PWA covers both mobile and desktop without native apps.
- ⚠️ Coupling UI and API in one process; acceptable at this scale.
- ⚠️ Real-time later (SSE/WebSocket) must fit Next's serverful runtime — fine on
  Railway (long-lived Node server), unlike pure-edge hosts.

## Alternatives considered

- **Separate SPA + standalone API (Express/Fastify):** more flexible, but two
  services to build/deploy/CORS-manage — against the "minimal" goal.
- **Go/HTMX single binary:** very light to host, but slower path to a polished,
  installable PWA and a rich editor.
