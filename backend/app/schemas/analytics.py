from datetime import date

from pydantic import BaseModel, ConfigDict


class AnalyticsCreate(BaseModel):
    metric_name: str
    metric_value: float
    recorded_at: date


class AnalyticsResponse(BaseModel):
    id: int
    site_id: int
    metric_name: str
    metric_value: float
    recorded_at: date

    model_config = ConfigDict(from_attributes=True)
