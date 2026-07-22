# Project Audit — Digital Twin Supply Chain Platform

## Overall Impression

The project is architecturally ambitious and the code quality is genuinely good for its scope — clean FastAPI patterns, proper async/sync separation for Celery, well-structured Zustand store, and a working dual-view (Graph + Map) frontend. The bones are solid.

That said, there are real absurdities, redundancies, and gaps between what the spec promises and what actually exists. Here they are, bluntly.

---

## 🔴 Absurdities (Things that are outright wrong or contradictory)

### 1. PostgreSQL is wired up but completely unused
**Files:** `db/postgres.py`, `models/base.py`, `health.py`, `docker-compose.yml`

PostgreSQL has full connection pooling, a SQLAlchemy async engine, a session generator, and a Docker service — but there are **zero ORM models**, **zero tables**, and **zero routes that actually inject a Postgres session**. The only place it's touched is the health check, where it runs `SELECT 1`. You're spinning up an entire database engine and paying its boot/memory cost for literally nothing. The spec says PostgreSQL handles "User Auth, Scenarios, Audit Logs, Transactional Data" — none of that exists.

`models/base.py` also has this gem:
```python
from unittest.mock import AsyncMock  # ← test framework import in production code
from sqlalchemy.orm import declarative_base

Base = declarative_base()
```
A test-framework import sitting in a production model file with zero models attached to it. That's a leftover file that was never built out.

---

### 2. The "Causal Reasoning Engine" is a plain BFS with a heuristic formula
**File:** `services/ml_causal_service.py`

The endpoint is called "ML Causal Engine". The spec promises **DoWhy, EconML, Structural Causal Models, and Pearlian do-calculus**. What's actually there is:

```python
vulnerability = 1.0 if neighbor_cap > 0 and neighbor_inv < (neighbor_cap * 0.2) else 0.4
predicted_risk = min(1.0, severity * vulnerability * 0.5)
```

That's a two-branch if/else formula on inventory ratio. No model is loaded, no causal graph is constructed, no interventions are computed — and the docstring openly admits it: *"Mock implementation of a Causal ML Model"*. The function is named `predict_delay_probability` but returns delta risk scores, not probabilities. The naming is misleading.

---

### 3. The "Optimization Engine" is a greedy heuristic, not OR-Tools
**File:** `services/ml_optimization_service.py`

The spec specifies **Google OR-Tools** for CVRP, inventory rebalancing, and cost minimization. What exists is a `for` loop scanning warehouse nodes and moving a fixed `30.0` units if inventory drops below `25.0`. There's no OR-Tools import, no objective function, no constraint solver. The function also **mutates the graph in place** (`G.nodes[best_wh]["inventory"] -= 30.0`) as a side-effect inside what's supposed to be a read/compute function — a subtle but real bug if called multiple times in the same tick.

---

### 4. The ML Routing model is trained on 100% synthetic, self-referential data
**File:** `services/ml_routing_service.py`

The XGBoost model is trained on `generate_synthetic_data()`, which itself generates delays using:
```python
delays = base_delays + congestion_impact + demand_impact + hub_impact
```
...and the model is then used to *predict* delays using the same features that were used to *generate* those delays. The model has no real signal — it's learning to reproduce a deterministic formula it was trained on. SHAP values from this model explain the formula, not real-world behavior. The `routing_model.pkl` (269 KB) in the repo is a trained artifact of this circular process.

---

### 5. Two separate "dual-mode" Redis connections (sync + async) with no abstraction
**Files:** `db/redis.py` (async), `services/simulation_service.py` (sync), `workers/simulation_worker.py` (sync)

The app has an async Redis client wrapped in `RedisConnection` for FastAPI, but the simulation service and worker open **fresh synchronous `redis.Redis` connections** directly using `redis.Redis.from_url()` — bypassing the shared client entirely and creating new connections on every simulation run. There's no connection pool sharing, no cleanup guarantee. This works but is fragile and redundant.

---

### 6. `handleSeed` in `page.tsx` calls `fetchGraph()` twice
**File:** `frontend/src/app/page.tsx`

```tsx
const handleSeed = async () => {
  await seedGraph();    // seedGraph() already calls fetchGraph() internally
  await fetchGraph();   // redundant second call
};
```
`seedGraph()` in the store already calls `await get().fetchGraph()` at the end. So `handleSeed` triggers two full graph fetches. Minor but wasteful — one is a no-op network round trip.

---

## 🟡 Redundancies (Things that are duplicated or over-engineered for current scope)

### 7. `ExplainabilityDrawer.tsx` and `ExplainabilityPanel.tsx` both exist
**Files:** `components/dashboard/ExplainabilityDrawer.tsx` (5.4 KB), `components/dashboard/ExplainabilityPanel.tsx` (8.8 KB)

There are two explainability components. The drawer is the one actually used in `page.tsx`. The Panel appears to be an older or alternative version that is **not imported anywhere**. It's dead code.

---

### 8. Celery config is duplicated across two files
**Files:** `app/celery_app.py` and `docker-compose.yml`

`REDIS_URI` is hardcoded as `"redis://redis:6379/1"` in `celery_app.py` (via `os.getenv`), but the `config.py` `Settings` class builds its own `REDIS_URI` from `REDIS_HOST` and `REDIS_PORT` (pointing to `/0` by default). Celery brokers on `db/1`, the FastAPI app connects to `db/0` — **different databases on the same Redis instance**. This is actually fine for isolation, but the duplicated hardcoded URI in `celery_app.py` means if you change your Redis config via env vars, Celery won't pick it up unless you also change that hardcode.

---

### 9. The `setEdges` action is defined but not typed in the store interface
**File:** `frontend/src/store/graphStore.ts`

```ts
// Line 138 — implementation exists
setEdges: (edges: AppEdge[]) => { set({ edges }); },

// But the GraphState type (line 36-86) has no `setEdges` entry
```
`setEdges` is defined as an implementation but missing from the `GraphState` type definition. TypeScript won't catch calls to it because it's not in the interface — it's a hidden method. Likely an oversight.

---

### 10. `simulation.py` schema has a duplicate import
**File:** `backend/app/schemas/simulation.py`

```python
from typing import Optional, Dict       # Line 2
from typing import Optional, Dict, List # Line 3 — duplicate, shadows line 2
```

---

### 11. `graphReasoning.ts` rebuilds adjacency maps on every call
**File:** `frontend/src/lib/graphReasoning.ts`

`getUpstreamNodes`, `getDownstreamNodes`, `getRiskContributors`, and `getImpactRadius` each call `buildAdjacencyMaps(edges)` independently. If the ExplainabilityPanel calls all four for a selected node, it rebuilds the same maps 3–4 times from scratch. The comment at the top brags about "O(1) adjacency maps for lightning-fast traversal" but the maps are rebuilt per-call, not memoized.

---

### 12. The "legacy backward compatibility" disruptions format is actively maintained in the simulation loop
**File:** `services/simulation_service.py` lines 121–134

There's a legacy `"timestamp": {"1": [...], "2": [...]}` dict-keyed disruption format still being iterated inside the main simulation loop at every timestep, right next to the new structured format (`node_failures`, `edge_disruptions`, etc.). There's nothing in the frontend that still sends this format — it appears to be dead code retained from an earlier iteration. These 13 lines run unnecessary dict lookups on every tick.

---

## 🟢 What's Actually Well Done

- **Async/sync boundary between FastAPI and Celery is correctly managed** — `snapshot_service.py` correctly uses a sync Neo4j driver inside the Celery worker context.
- **The `connect_with_retry` exponential backoff** in `main.py` is clean and correct.
- **Neo4j batch import with `UNWIND`** is the right approach for performance.
- **The graph store polling architecture** (status poll → metrics pull cascade) is sensible.
- **SHAP integration** for routing explainability is a genuinely good idea, just undermined by synthetic training data.
- **Docker Compose** correctly separates backend, worker, DBs, and would work out of the box.

---

## Summary Table

| Issue | Severity | File(s) |
|---|---|---|
| PostgreSQL fully wired but unused | 🔴 High | `db/postgres.py`, `models/base.py` |
| `unittest.mock` import in production model | 🔴 High | `models/base.py` |
| Causal engine is a heuristic, not SCM/DoWhy | 🔴 High | `ml_causal_service.py` |
| Optimization engine is greedy loop, not OR-Tools | 🔴 High | `ml_optimization_service.py` |
| ML model trained on own synthetic target | 🔴 High | `ml_routing_service.py` |
| Dual Redis connections with no pool sharing | 🟡 Medium | `db/redis.py`, `simulation_service.py` |
| Double `fetchGraph()` call on seed | 🟡 Medium | `page.tsx` |
| Dead `ExplainabilityPanel.tsx` component | 🟡 Medium | `ExplainabilityPanel.tsx` |
| Celery URI hardcoded, bypasses `Settings` | 🟡 Medium | `celery_app.py` |
| `setEdges` missing from TypeScript interface | 🟡 Medium | `graphStore.ts` |
| Duplicate `from typing import` | 🟢 Low | `schemas/simulation.py` |
| Adjacency maps rebuilt on every reasoning call | 🟢 Low | `graphReasoning.ts` |
| Legacy disruption format maintained unnecessarily | 🟢 Low | `simulation_service.py` |
