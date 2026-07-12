"""add user language column

Revision ID: c5e2a1b9d3f4
Revises: a1f4c2d9b6e7
Create Date: 2026-07-12 14:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c5e2a1b9d3f4"
down_revision: str | None = "a1f4c2d9b6e7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # UI language preference (E12): NOT NULL, defaulting to 'FR' so existing
    # members keep the francophone-first UI (design/claude.md) until they switch.
    with op.batch_alter_table("user", schema=None) as batch_op:
        batch_op.add_column(sa.Column("language", sa.String(), nullable=False, server_default="FR"))


def downgrade() -> None:
    with op.batch_alter_table("user", schema=None) as batch_op:
        batch_op.drop_column("language")
