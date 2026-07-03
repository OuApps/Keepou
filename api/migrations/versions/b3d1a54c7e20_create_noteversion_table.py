"""create noteversion table

Revision ID: b3d1a54c7e20
Revises: f9c69e619873
Create Date: 2026-07-03 09:20:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "b3d1a54c7e20"
down_revision: str | None = "f9c69e619873"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _existing_enum(name: str, *values: str) -> sa.types.TypeEngine:
    """Reuse the ENUM types created by the note-table migration.

    On Postgres the native types already exist (`create_type=False` keeps
    Alembic from re-issuing CREATE TYPE); on SQLite an Enum renders as plain
    VARCHAR, so a fresh sa.Enum is fine.
    """
    if op.get_bind().dialect.name == "postgresql":
        return postgresql.ENUM(*values, name=name, create_type=False)
    return sa.Enum(*values, name=name)


def upgrade() -> None:
    # Append-only version snapshots (E6-S1) — one row per editing session,
    # plus the creation snapshot; restore appends, never overwrites (FR-H4).
    op.create_table(
        "noteversion",
        sa.Column("id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("note_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("author_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("title", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("body", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column(
            "color",
            _existing_enum("notecolor", "GOLD", "AVOCAT", "SALSA", "CLAY", "TEAL"),
            nullable=False,
        ),
        sa.Column(
            "visibility",
            _existing_enum("visibility", "PRIVATE", "PUBLIC"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        # Named explicitly (like E5's lock FK): autogenerate leaves FK names as
        # None, which Postgres can't drop on downgrade.
        sa.ForeignKeyConstraint(["note_id"], ["note.id"], name="fk_noteversion_note_id_note"),
        sa.ForeignKeyConstraint(["author_id"], ["user.id"], name="fk_noteversion_author_id_user"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("noteversion", schema=None) as batch_op:
        # The history read path: a note's versions, newest first (E6-S1).
        batch_op.create_index(
            "ix_noteversion_note_id_created_at", ["note_id", "created_at"], unique=False
        )


def downgrade() -> None:
    with op.batch_alter_table("noteversion", schema=None) as batch_op:
        batch_op.drop_index("ix_noteversion_note_id_created_at")
    op.drop_table("noteversion")
    # The notecolor/visibility ENUM types belong to the note table's migration
    # (207f42539798) — they are deliberately NOT dropped here.
