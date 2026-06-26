# ADR-0006 — AGPL-3.0 license

**Status:** Accepted · **Date:** 2026-06-26

## Context

Keepou is an open-source, self-hosted, network-served application. The author
wants modifications that are run as a service to remain open, consistent with
sibling project [niouzou](https://github.com/OuApps/niouzou) (also AGPL-3.0).

## Decision

License the project under the **GNU Affero General Public License v3.0
(AGPL-3.0)**. The full text lives in [`/LICENSE`](../../LICENSE).

## Consequences

- ✅ Anyone who runs a **modified** Keepou as a network service must offer the
  corresponding **source** to its users (the AGPL "network use" clause).
- ✅ Keeps the ecosystem open and aligned with niouzou.
- ⚠️ Some companies avoid AGPL dependencies; this can limit certain commercial
  adoption. Accepted, given the project's self-hosted, open ethos.
- ⚠️ Contributions are inbound under the same license; contributors should be
  aware.

## Alternatives considered

- **MIT/Apache-2.0:** maximally permissive, but a modified hosted fork could stay
  closed — contrary to the intent.
- **GPL-3.0:** copyleft, but its obligations don't trigger for network-only use;
  AGPL closes that gap for a hosted app.
