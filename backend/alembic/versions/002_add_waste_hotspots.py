"""Add wastehotspot table.

Revision ID: 20240520_0002
Revises: 20240520_0001
Create Date: 2026-05-20 22:55:00.000000

"""

from alembic import op
import sqlalchemy as sa


revision = "20240520_0002"
down_revision = "20240520_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "wastehotspot",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("lat", sa.Double(precision=53), nullable=False),
        sa.Column("lon", sa.Double(precision=53), nullable=False),
        sa.Column("waste_type", sa.String(), nullable=False),
        sa.Column("severity", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("image_url", sa.String(), nullable=True),
        sa.Column("image_base64", sa.String(), nullable=True),
        sa.Column("reported_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column("cleaned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cleanup_image_base64", sa.String(), nullable=True),
        sa.Column("eco_points_awarded", sa.Integer(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_wastehotspot_waste_type"), "wastehotspot", ["waste_type"], unique=False
    )
    op.create_index(
        op.f("ix_wastehotspot_reported_at"), "wastehotspot", ["reported_at"], unique=False
    )
    op.create_index(
        op.f("ix_wastehotspot_status"), "wastehotspot", ["status"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_wastehotspot_status"), table_name="wastehotspot")
    op.drop_index(op.f("ix_wastehotspot_reported_at"), table_name="wastehotspot")
    op.drop_index(op.f("ix_wastehotspot_waste_type"), table_name="wastehotspot")
    op.drop_table("wastehotspot")
