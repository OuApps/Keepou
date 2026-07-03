"""create note_version table

Revision ID: bc7203093a26
Revises: f9c69e619873
Create Date: 2026-07-03 09:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "bc7203093a26"
down_revision: str | None = "f9c69e619873"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Named explicitly: autogenerate leaves FK names as None, which Postgres can't
# drop on downgrade and SQLite batch mode can't recreate.
FK_NOTE = "fk_noteversion_note_id_note"
FK_AUTHOR = "fk_noteversion_author_id_user"


def _existing_enum(name: str, *values: str) -> sa.Enum:
    """Reference an ENUM already created by the note-table migration.

    On Postgres the `notecolor` / `visibility` types exist, so `create_type=False`
    stops `create_table` from re-`CREATE TYPE`-ing them (which would fail). On
    SQLite enums are plain VARCHAR — a generic Enum is enough.
    """
    if op.get_bind().dialect.name == "postgresql":
        return postgresql.ENUM(*values, name=name, create_type=False)
    return sa.Enum(*values, name=name)


def upgrade() -> None:
    # History table (E6-S1) — append-only snapshot of a note at session end.
    op.create_table(
        "noteversion",
        sa.Column("id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("note_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("author_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("title", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("body", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("color", _existing_enum("notecolor", "GOLD", "AVOCAT", "SALSA", "CLAY", "TEAL"),
                  nullable=False),
        sa.Column("visibility", _existing_enum("visibility", "PRIVATE", "PUBLIC"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["note_id"], ["note.id"], name=FK_NOTE),
        sa.ForeignKeyConstraint(["author_id"], ["user.id"], name=FK_AUTHOR),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("noteversion", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_noteversion_note_id"), ["note_id"], unique=False)
        # Composite index backing the history listing: newest-first per note.
        batch_op.create_index(
            "ix_noteversion_note_id_created_at", ["note_id", "created_at"], unique=False
        )


def downgrade() -> None:
    with op.batch_alter_table("noteversion", schema=None) as batch_op:
        batch_op.drop_index("ix_noteversion_note_id_created_at")
        batch_op.drop_index(batch_op.f("ix_noteversion_note_id"))
    op.drop_table("noteversion")
    # The `notecolor` / `visibility` ENUM types are owned by the note-table
    # migration (referenced with create_type=False here), so we leave them.
