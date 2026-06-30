"""
Markdown (GFM task lists) — validation/normalisation côté serveur (optionnel).

Le corps des notes est stocké en Markdown dès le MVP (handoff §3.3) :
- paragraphe → texte ;
- case → `- [ ] libellé` (non cochée) / `- [x] libellé` (cochée) ;
- titre stocké à part (champ dédié), pas dans le Markdown.

La sérialisation de référence est `buildMd` dans `design/Keepou - Éditeur canonique.dc.html` ;
`web/src/lib/markdown.ts` en est le miroir côté front. Squelette : implémenté en E3.
"""
