import os
from celery import Celery

REDIS_URI = os.getenv("REDIS_URI", "redis://redis:6379/1")

celery_app = Celery(
    "digital_twin_worker",
    broker=REDIS_URI,
    backend=REDIS_URI,
    include=["app.workers.simulation_worker"]
)

celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    task_track_started=True,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    broker_connection_retry_on_startup=True,
)
