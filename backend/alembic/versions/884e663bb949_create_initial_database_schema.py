"""create initial database schema

Revision ID: 884e663bb949
Revises:
Create Date: 2026-09-18 12:51:53.449385

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geometry

# revision identifiers, used by Alembic.
revision: str = "884e663bb949"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the initial database schema."""

    # Enable PostGIS
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    # Users table
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "name",
            sa.String(length=100),
            nullable=False,
        ),
        sa.Column(
            "email",
            sa.String(length=255),
            nullable=False,
        ),
        sa.Column(
            "password_hash",
            sa.String(length=255),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        "ix_users_id",
        "users",
        ["id"],
        unique=False,
    )

    op.create_index(
        "ix_users_email",
        "users",
        ["email"],
        unique=True,
    )

    # Projects table
    op.create_table(
        "projects",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "name",
            sa.String(length=150),
            nullable=False,
        ),
        sa.Column(
            "description",
            sa.Text(),
            nullable=True,
        ),
        sa.Column(
            "created_by",
            sa.Integer(),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        "ix_projects_id",
        "projects",
        ["id"],
        unique=False,
    )

    # Sites table
    op.create_table(
        "sites",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "project_id",
            sa.Integer(),
            nullable=False,
        ),
        sa.Column(
            "name",
            sa.String(length=150),
            nullable=False,
        ),
        sa.Column(
            "description",
            sa.Text(),
            nullable=True,
        ),
        sa.Column(
            "geometry",
            Geometry(
                geometry_type="POLYGON",
                srid=4326,
            ),
            nullable=False,
        ),
        sa.Column(
            "area",
            sa.Numeric(precision=12, scale=2),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        "ix_sites_id",
        "sites",
        ["id"],
        unique=False,
    )

    op.create_index(
        "ix_sites_project_id",
        "sites",
        ["project_id"],
        unique=False,
    )

    op.create_index(
        "idx_sites_geometry",
        "sites",
        ["geometry"],
        unique=False,
        postgresql_using="gist",
    )

    # Site analytics table
    op.create_table(
        "site_analytics",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "site_id",
            sa.Integer(),
            nullable=False,
        ),
        sa.Column(
            "metric_name",
            sa.String(length=100),
            nullable=False,
        ),
        sa.Column(
            "metric_value",
            sa.Float(),
            nullable=False,
        ),
        sa.Column(
            "recorded_at",
            sa.Date(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["site_id"],
            ["sites.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        "ix_site_analytics_id",
        "site_analytics",
        ["id"],
        unique=False,
    )

    op.create_index(
        "ix_site_analytics_site_id",
        "site_analytics",
        ["site_id"],
        unique=False,
    )


def downgrade() -> None:
    """Remove the application schema."""

    op.drop_index(
        "ix_site_analytics_site_id",
        table_name="site_analytics",
    )
    op.drop_index(
        "ix_site_analytics_id",
        table_name="site_analytics",
    )
    op.drop_table("site_analytics")

    op.drop_index(
        "idx_sites_geometry",
        table_name="sites",
    )
    op.drop_index(
        "ix_sites_project_id",
        table_name="sites",
    )
    op.drop_index(
        "ix_sites_id",
        table_name="sites",
    )
    op.drop_table("sites")

    op.drop_index(
        "ix_projects_id",
        table_name="projects",
    )
    op.drop_table("projects")

    op.drop_index(
        "ix_users_email",
        table_name="users",
    )
    op.drop_index(
        "ix_users_id",
        table_name="users",
    )
    op.drop_table("users")
