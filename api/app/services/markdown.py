"""
Markdown (GFM task lists) — server-side validation/normalization (optional).

Note bodies are stored as Markdown from the MVP onward (handoff §3.3):
- paragraph → text;
- checkbox → `- [ ] libellé` (unchecked) / `- [x] libellé` (checked);
- title stored separately (dedicated field), not in the Markdown.

The reference serialization is `buildMd` in `design/Keepou - Éditeur canonique.dc.html`;
`web/src/lib/markdown.ts` is its front-end mirror. Scaffold: implemented in E4.
"""
