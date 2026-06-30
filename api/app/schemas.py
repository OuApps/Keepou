"""
Schémas Pydantic d'entrée/sortie de l'API.

Squelette : remplis story par story. Conventions (handoff §5) :
- schémas Pydantic explicites en entrée et sortie ;
- codes d'erreur via HTTPException (401, 403, 409) ;
- le front n'affiche que ce que l'API renvoie (contrôles sensibles côté serveur).
"""
