"""Initial migration: Create historical_data and users tables."""

from alembic import op
import sqlalchemy as sa


revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "historicaldata",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("location_city", sa.String(), nullable=False),
        sa.Column("location_lat", sa.Double(precision=53), nullable=False),
        sa.Column("location_lon", sa.Double(precision=53), nullable=False),
        sa.Column("parameter", sa.String(), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("unit", sa.String(), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source", sa.String(), nullable=False, server_default="openaq"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_historicaldata_location_city"), "historicaldata", ["location_city"], unique=False)
    op.create_index(op.f("ix_historicaldata_timestamp"), "historicaldata", ["timestamp"], unique=False)

    op.create_table(
        "user",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("is_superuser", sa.Boolean(), nullable=False, server_default="false"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_user_email"), "user", ["email"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_user_email"), table_name="user")
    op.drop_table("user")
    op.drop_index(op.f("ix_historicaldata_timestamp"), table_name="historicaldata")
    op.drop_index(op.f("ix_historicaldata_location_city"), table_name="historicaldata")
    op.drop_table("historicaldata")

