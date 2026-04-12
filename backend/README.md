# Digital Twin API - Phase 1: Backend Foundation

This is the initial, minimal backend skeleton for the Causally-Aware Supply Chain Digital Twin platform.
It establishes the core architectural foundation around FastAPI, PostgreSQL, Neo4j, and Redis.

## Features Included in Phase 1
- **FastAPI**: Asynchronous routing and application lifecycle management.
- **PostgreSQL**: Configured with `asyncpg` and SQLAlchemy 2.0 (async context) for relational data.
- **Neo4j**: Configured with the official Python async driver for graph persistence.
- **Redis**: Configured with `redis.asyncio` for fast cache and pub/sub.
- **Centralized Logging**: Standard Python logging outputting to stdout for Docker compatibility.
- **Environment Configuration**: Robust validation and loading via Pydantic v2 `BaseSettings`.
- **Health Check**: `GET /health` endpoint verifying connectivity to all 3 DB engines.
- **Dockerized Setup**: `docker-compose.yml` to spin up the API and all dependencies simultaneously.

---

## Architectural Decisions

1. **Strict Async Paradigm**: Every DB connection (SQLAlchemy async session, Neo4j async session, Redis async client) is configured asynchronously. This is crucial to handle the heavy concurrent load required by simulation systems without blocking the event loop.
2. **Dependency Injection**: Database connection functions (`get_db_session`, `get_neo4j_session`, `get_redis_client`) are configured as Python Generators. This allows FastAPI's `Depends()` to inject them into route handlers, keeping business logic decoupled from connection management and ensuring safe connection closure.
3. **Lifespan Management**: Neo4j and Redis connections are opened during FastAPI's `lifespan` startup event and explicitly closed during shutdown, ensuring no dangling sockets or connection leaks.

---

## Project Structure

```text
backend/
├── app/
│   ├── main.py              # FastAPI entry point & lifespan handlers
│   ├── api/
│   │   └── health.py        # Healthcheck route verifying PostgreSQL, Neo4j, Redis
│   ├── core/
│   │   ├── config.py        # Environment variables loader (Pydantic Settings)
│   │   └── logging.py       # Global logging setup
│   ├── db/
│   │   ├── postgres.py      # SQLAlchemy 2.0 Async engine and session maker
│   │   ├── neo4j.py         # Official Neo4j python async connection wrapper
│   │   └── redis.py         # Redis async context setup
│   ├── models/
│   │   └── base.py          # SQLAlchemy declarative base (Models go here)
│   ├── schemas/
│   │   ├── response.py      # Standardized API JSON wrapper per GEMINI specs
│   │   └── health.py        # Pydantic schema for health response
│   └── services/            # (Future: Business logic)
├── tests/                   # (Future: PyTest)
├── docker-compose.yml       # Composes all 4 services
├── Dockerfile               # Python 3.11 slim image construction
└── requirements.txt         # Pinned python dependencies
```

---

## Setup & Running Instructions

### Prerequisites
- Docker & Docker Compose installed natively.

### 1. Build and Run the Stack
Navigate to the `backend` directory and run:

```bash
docker-compose build
docker-compose up -d
```

*This will pull the Postgres, Neo4j, and Redis images, build the FastAPI backend, and start them. The first time you run this, it may take a few minutes to download the large DB images.*

### 2. Verify Execution
Check the live logs for the backend container to ensure all connections initialized correctly:

```bash
docker-compose logs -f backend
```

Look for:
```text
INFO - Connected to Neo4j successfully.
INFO - Connected to Redis successfully.
INFO - Starting Digital Twin API v0.1.0
... Application startup complete.
```

### 3. Test the Health Endpoint
The API exposes a highly structural health check endpoint that individually reaches out to the three databases.

Run a CURL command or open your browser to:
`http://localhost:8000/health`

**Expected JSON Response:**
```json
{
  "status": "success",
  "data": {
    "status": "healthy",
    "postgres_status": "connected",
    "neo4j_status": "connected",
    "redis_status": "connected",
    "timestamp": "2026-02-28T12:00:00.000000+00:00"
  },
  "meta": {
    "timestamp": "2026-02-28T12:00:00.000000+00:00"
  },
  "error": null
}
```

### 4. Shutting Down
To tear down the network but keep data volumes:

```bash
docker-compose down
```

To entirely destroy the volumes (erasing DB state):
```bash
docker-compose down -v
```
