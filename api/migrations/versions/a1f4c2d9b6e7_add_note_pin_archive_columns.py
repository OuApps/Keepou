"""add note pin and archive columns

Revision ID: a1f4c2d9b6e7
Revises: b3d1a54c7e20
Create Date: 2026-07-05 18:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1f4c2d9b6e7"
down_revision: str | None = "b3d1a54c7e20"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Board-organization flags (E8): NOT NULL booleans defaulting to false, so
    # existing notes come back unpinned and non-archived. `pinned` floats a note
    # to the top of its board; `archived` hides it from every board (FR-N8).
    with op.batch_alter_table("note", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("pinned", sa.Boolean(), nullable=False, server_default=sa.false())
        )
        batch_op.add_column(
            sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.false())
        )


def downgrade() -> None:
    with op.batch_alter_table("note", schema=None) as batch_op:
        batch_op.drop_column("archived")
        batch_op.drop_column("pinned")
