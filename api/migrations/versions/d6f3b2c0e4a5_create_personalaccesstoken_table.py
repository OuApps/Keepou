"""create personalaccesstoken table

Revision ID: d6f3b2c0e4a5
Revises: c5e2a1b9d3f4
Create Date: 2026-07-12 14:10:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d6f3b2c0e4a5"
down_revision: str | None = "c5e2a1b9d3f4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Personal Access Tokens (E13): long-lived bearer secrets an agent uses over
    # MCP. Only the SHA-256 hash is stored (never the secret); `revoked_at` set =
    # disabled without deletion. `token_hash` is unique + indexed for O(1) lookup.
    op.create_table(
        "personalaccesstoken",
        sa.Column("id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("user_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("token_hash", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("prefix", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"], ["user.id"], name="fk_personalaccesstoken_user_id_user"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("personalaccesstoken", schema=None) as batch_op:
        batch_op.create_index("ix_personalaccesstoken_token_hash", ["token_hash"], unique=True)
        batch_op.create_index("ix_personalaccesstoken_user_id", ["user_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("personalaccesstoken", schema=None) as batch_op:
        batch_op.drop_index("ix_personalaccesstoken_user_id")
        batch_op.drop_index("ix_personalaccesstoken_token_hash")
    op.drop_table("personalaccesstoken")
