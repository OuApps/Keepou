"""add note lock columns

Revision ID: f9c69e619873
Revises: 207f42539798
Create Date: 2026-07-02 20:38:53.590400

"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f9c69e619873"
down_revision: str | None = "207f42539798"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Named explicitly: autogenerate leaves FK names as None, which Postgres can't
# drop on downgrade and SQLite batch mode can't recreate.
FK_LOCKED_BY = "fk_note_locked_by_id_user"


def upgrade() -> None:
    # Single-editor lock (E5-S1) — three nullable columns; existing notes stay
    # unlocked (all NULL). The lock is carried by the note (≤ 1 active lock) so
    # acquisition can be an atomic conditional UPDATE (ARCHITECTURE §5).
    with op.batch_alter_table("note", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("locked_by_id", sqlmodel.sql.sqltypes.AutoString(), nullable=True)
        )
        batch_op.add_column(sa.Column("locked_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("lock_expires_at", sa.DateTime(), nullable=True))
        batch_op.create_foreign_key(FK_LOCKED_BY, "user", ["locked_by_id"], ["id"])


def downgrade() -> None:
    with op.batch_alter_table("note", schema=None) as batch_op:
        batch_op.drop_constraint(FK_LOCKED_BY, type_="foreignkey")
        batch_op.drop_column("lock_expires_at")
        batch_op.drop_column("locked_at")
        batch_op.drop_column("locked_by_id")
