from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.database import engine
from app.models import User, Project, Site, SiteAnalytics

from app.auth.router import router as auth_router
from app.routers.projects import router as projects_router
from app.routers.sites import router as sites_router
from app.routers.analytics import router as analytics_router

app = FastAPI(
    title="Darukaa.Earth API",
    description="Geospatial carbon and biodiversity analytics platform",
    version="1.0.0",
)


# --------------------------------------------------
# CORS
# --------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------
# Routers
# --------------------------------------------------

app.include_router(auth_router)
app.include_router(projects_router)
app.include_router(sites_router)
app.include_router(analytics_router)


# --------------------------------------------------
# Basic endpoints
# --------------------------------------------------


@app.get("/")
def root():
    return {
        "message": "Darukaa.Earth API is running",
        "status": "success",
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
    }


@app.get("/db-test")
def database_test():
    with engine.connect() as connection:
        result = connection.execute(text("SELECT current_database();"))

        database_name = result.scalar()

    return {
        "database": database_name,
        "status": "connected",
    }
