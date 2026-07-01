"""
Pydantic input/output schemas for the API.

Scaffold: filled story by story. Conventions (handoff §5):
- explicit Pydantic schemas for input and output;
- error codes via HTTPException (401, 403, 409);
- the front only displays what the API returns (sensitive checks server-side).
"""
