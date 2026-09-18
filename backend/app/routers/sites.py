from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import shape
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.security import get_current_user
from app.database import get_db
from app.models.project import Project
from app.models.site import Site
from app.models.site_analytics import SiteAnalytics
from app.models.user import User
from app.schemas.site import (
    SiteCreate,
    SiteResponse,
    SiteUpdate,
)

router = APIRouter(
    prefix="/projects/{project_id}/sites",
    tags=["Sites"],
)


def get_user_project(
    project_id: int,
    db: Session,
    current_user: User,
):
    project = db.scalar(
        select(Project).where(
            Project.id == project_id,
            Project.created_by == current_user.id,
        )
    )

    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    return project


def validate_geometry(geojson: dict):
    try:
        geometry = shape(geojson)
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Invalid GeoJSON geometry",
        )

    if geometry.geom_type != "Polygon":
        raise HTTPException(
            status_code=400,
            detail="Site geometry must be a Polygon",
        )

    if geometry.is_empty or not geometry.is_valid:
        raise HTTPException(
            status_code=400,
            detail="Invalid polygon geometry",
        )

    return geometry


def calculate_area_hectares(
    site: Site,
    db: Session,
) -> float:

    area = db.scalar(
        select(
            func.ST_Area(
                func.ST_Transform(
                    site.geometry,
                    6933,
                )
            )
            / 10000
        )
    )

    return round(float(area), 2)


def site_to_response(site: Site) -> dict:
    geometry = to_shape(site.geometry)

    coordinates = [list(geometry.exterior.coords)]

    coordinates.extend(list(ring.coords) for ring in geometry.interiors)

    return {
        "id": site.id,
        "project_id": site.project_id,
        "name": site.name,
        "description": site.description,
        "geometry": {
            "type": "Polygon",
            "coordinates": coordinates,
        },
        "area": (float(site.area) if site.area is not None else None),
        "created_at": site.created_at,
    }


# -----------------------------------------
# Create demo analytics for a new site
# -----------------------------------------


def create_demo_analytics(
    site_id: int,
    db: Session,
):
    analytics = [
        SiteAnalytics(
            site_id=site_id,
            metric_name="Carbon Sequestration",
            metric_value=125.5,
            recorded_at=date(2026, 1, 1),
        ),
        SiteAnalytics(
            site_id=site_id,
            metric_name="Biodiversity Index",
            metric_value=62.5,
            recorded_at=date(2026, 1, 1),
        ),
        SiteAnalytics(
            site_id=site_id,
            metric_name="Tree Cover",
            metric_value=48.2,
            recorded_at=date(2026, 1, 1),
        ),
        SiteAnalytics(
            site_id=site_id,
            metric_name="Carbon Sequestration",
            metric_value=132.8,
            recorded_at=date(2026, 4, 1),
        ),
        SiteAnalytics(
            site_id=site_id,
            metric_name="Biodiversity Index",
            metric_value=68.3,
            recorded_at=date(2026, 4, 1),
        ),
        SiteAnalytics(
            site_id=site_id,
            metric_name="Tree Cover",
            metric_value=51.7,
            recorded_at=date(2026, 4, 1),
        ),
        SiteAnalytics(
            site_id=site_id,
            metric_name="Carbon Sequestration",
            metric_value=141.2,
            recorded_at=date(2026, 7, 1),
        ),
        SiteAnalytics(
            site_id=site_id,
            metric_name="Biodiversity Index",
            metric_value=74.1,
            recorded_at=date(2026, 7, 1),
        ),
        SiteAnalytics(
            site_id=site_id,
            metric_name="Tree Cover",
            metric_value=55.4,
            recorded_at=date(2026, 7, 1),
        ),
    ]

    db.add_all(analytics)


# -----------------------------------------
# Create site
# -----------------------------------------


@router.post(
    "",
    response_model=SiteResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_site(
    project_id: int,
    site_data: SiteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_user_project(
        project_id,
        db,
        current_user,
    )

    geometry = validate_geometry(site_data.geometry)

    site = Site(
        project_id=project_id,
        name=site_data.name,
        description=site_data.description,
        geometry=from_shape(
            geometry,
            srid=4326,
        ),
    )

    db.add(site)
    db.flush()

    # Calculate area using PostGIS
    site.area = calculate_area_hectares(
        site,
        db,
    )

    # Add realistic demo environmental data
    create_demo_analytics(
        site.id,
        db,
    )

    db.commit()
    db.refresh(site)

    return site_to_response(site)


# -----------------------------------------
# Get all sites
# -----------------------------------------


@router.get(
    "",
    response_model=list[SiteResponse],
)
def get_sites(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_user_project(
        project_id,
        db,
        current_user,
    )

    sites = db.scalars(
        select(Site)
        .where(Site.project_id == project_id)
        .order_by(Site.created_at.desc())
    ).all()

    return [site_to_response(site) for site in sites]


# -----------------------------------------
# Get single site
# -----------------------------------------


@router.get(
    "/{site_id}",
    response_model=SiteResponse,
)
def get_site(
    project_id: int,
    site_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_user_project(
        project_id,
        db,
        current_user,
    )

    site = db.scalar(
        select(Site).where(
            Site.id == site_id,
            Site.project_id == project_id,
        )
    )

    if site is None:
        raise HTTPException(
            status_code=404,
            detail="Site not found",
        )

    return site_to_response(site)


# -----------------------------------------
# Get site analytics
# -----------------------------------------


@router.get(
    "/{site_id}/analytics",
)
def get_site_analytics(
    project_id: int,
    site_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_user_project(
        project_id,
        db,
        current_user,
    )

    site = db.scalar(
        select(Site).where(
            Site.id == site_id,
            Site.project_id == project_id,
        )
    )

    if site is None:
        raise HTTPException(
            status_code=404,
            detail="Site not found",
        )

    analytics = db.scalars(
        select(SiteAnalytics)
        .where(SiteAnalytics.site_id == site_id)
        .order_by(
            SiteAnalytics.recorded_at.asc(),
            SiteAnalytics.id.asc(),
        )
    ).all()

    return [
        {
            "id": item.id,
            "site_id": item.site_id,
            "metric_name": item.metric_name,
            "metric_value": item.metric_value,
            "recorded_at": item.recorded_at,
        }
        for item in analytics
    ]


# -----------------------------------------
# Update site
# -----------------------------------------


@router.put(
    "/{site_id}",
    response_model=SiteResponse,
)
def update_site(
    project_id: int,
    site_id: int,
    site_data: SiteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_user_project(
        project_id,
        db,
        current_user,
    )

    site = db.scalar(
        select(Site).where(
            Site.id == site_id,
            Site.project_id == project_id,
        )
    )

    if site is None:
        raise HTTPException(
            status_code=404,
            detail="Site not found",
        )

    if site_data.name is not None:
        site.name = site_data.name

    if site_data.description is not None:
        site.description = site_data.description

    if site_data.geometry is not None:
        geometry = validate_geometry(site_data.geometry)

        site.geometry = from_shape(
            geometry,
            srid=4326,
        )

    db.commit()
    db.refresh(site)

    # Recalculate area after geometry update
    if site_data.geometry is not None:
        site.area = calculate_area_hectares(
            site,
            db,
        )

        db.commit()
        db.refresh(site)

    return site_to_response(site)


# -----------------------------------------
# Delete site
# -----------------------------------------


@router.delete(
    "/{site_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_site(
    project_id: int,
    site_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_user_project(
        project_id,
        db,
        current_user,
    )

    site = db.scalar(
        select(Site).where(
            Site.id == site_id,
            Site.project_id == project_id,
        )
    )

    if site is None:
        raise HTTPException(
            status_code=404,
            detail="Site not found",
        )

    # Remove analytics before removing site
    db.query(SiteAnalytics).filter(SiteAnalytics.site_id == site_id).delete(
        synchronize_session=False
    )

    db.delete(site)
    db.commit()
