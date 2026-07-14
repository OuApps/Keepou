"""retire legacy member-scoped agent tokens

Revision ID: e7a1c3f95b48
Revises: d6f3b2c0e4a5
Create Date: 2026-07-14 10:00:00.000000

The E13 rework gives the MCP agent its own identity, **Botou**: every agent token
is now owned by Botou (services/bot.py), and `resolve_bot_token` only accepts
Botou-owned tokens. Any Personal Access Token minted under the old model belongs
to a human member, so it is already inert (it can no longer authenticate) *and*
invisible to the admin token UI (which is Botou-scoped) — an un-manageable orphan.

This data migration retires those tokens explicitly: every still-active token not
owned by Botou is stamped `revoked_at`, so the table reflects reality and the
retirement is auditable. Admins mint fresh Botou-owned keys afterwards. No schema
change. Botou-owned tokens (if the account already exists) are left untouched.
"""

from collections.abc import Sequence
from datetime import UTC, datetime

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e7a1c3f95b48"
down_revision: str | None = "d6f3b2c0e4a5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Keep in sync with app.models.BOT_EMAIL (inlined so the migration is stable even
# if the constant is later renamed — a migration is a historical record).
BOT_EMAIL = "botou@bot.keepou"


def upgrade() -> None:
    now = datetime.now(UTC).replace(tzinfo=None)  # naive UTC, matching the columns
    op.get_bind().execute(
        sa.text(
            "UPDATE personalaccesstoken SET revoked_at = :now "
            "WHERE revoked_at IS NULL "
            'AND user_id NOT IN (SELECT id FROM "user" WHERE email = :bot)'
        ),
        {"now": now, "bot": BOT_EMAIL},
    )


def downgrade() -> None:
    # Retiring a leaked-model credential is intentionally irreversible: we cannot
    # tell which tokens this migration revoked from those already revoked, and
    # un-revoking would resurrect tokens that can no longer be managed. No-op.
    pass
