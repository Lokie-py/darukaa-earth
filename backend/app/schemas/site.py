from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SiteCreate(BaseModel):
    name: str
    description: str | None = None
    geometry: dict


class SiteUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    geometry: dict | None = None


class SiteResponse(BaseModel):
    id: int
    project_id: int
    name: str
    description: str | None
    geometry: dict
    area: float | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
