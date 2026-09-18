from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.security import get_current_user
from app.database import get_db
from app.models.project import Project
from app.models.site import Site
from app.models.site_analytics import SiteAnalytics
from app.models.user import User
from app.schemas.analytics import (
    AnalyticsCreate,
    AnalyticsResponse,
)

router = APIRouter(
    prefix="/projects/{project_id}/sites/{site_id}/analytics",
    tags=["Analytics"],
)


def get_user_site(
    project_id: int,
    site_id: int,
    db: Session,
    current_user: User,
):
    site = db.scalar(
        select(Site)
        .join(Project, Site.project_id == Project.id)
        .where(
            Site.id == site_id,
            Site.project_id == project_id,
            Project.created_by == current_user.id,
        )
    )

    if site is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Site not found",
        )

    return site


@router.post(
    "",
    response_model=AnalyticsResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_analytics(
    project_id: int,
    site_id: int,
    analytics_data: AnalyticsCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_user_site(
        project_id,
        site_id,
        db,
        current_user,
    )

    analytics = SiteAnalytics(
        site_id=site_id,
        metric_name=analytics_data.metric_name,
        metric_value=analytics_data.metric_value,
        recorded_at=analytics_data.recorded_at,
    )

    db.add(analytics)
    db.commit()
    db.refresh(analytics)

    return analytics


@router.get(
    "",
    response_model=list[AnalyticsResponse],
)
def get_analytics(
    project_id: int,
    site_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_user_site(
        project_id,
        site_id,
        db,
        current_user,
    )

    analytics = db.scalars(
        select(SiteAnalytics)
        .where(SiteAnalytics.site_id == site_id)
        .order_by(SiteAnalytics.recorded_at.asc())
    ).all()

    return analytics


@router.delete(
    "/{analytics_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_analytics(
    project_id: int,
    site_id: int,
    analytics_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_user_site(
        project_id,
        site_id,
        db,
        current_user,
    )

    analytics = db.scalar(
        select(SiteAnalytics).where(
            SiteAnalytics.id == analytics_id,
            SiteAnalytics.site_id == site_id,
        )
    )

    if analytics is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Analytics record not found",
        )

    db.delete(analytics)
    db.commit()
