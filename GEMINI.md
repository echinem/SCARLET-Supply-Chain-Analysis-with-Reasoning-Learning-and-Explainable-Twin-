# Causally-Aware Supply Chain Digital Twin

## Principal Systems Architect + Senior Full-Stack Engineer Specification

---

## 0. Mission

Build a production-grade Causally-Aware Supply Chain Digital Twin platform.

The system must:
- Model complex, multi-echelon supply chains as dynamic, interactive graphs.
- Simulate structural disruptions and probabilistic cascading failures.
- Propagate failures causally using Structural Causal Models (SCMs).
- Optimize routing, inventory rebalancing, and capacity allocation.
- Compare AI-recommended interventions vs. manual human decisions.
- Provide deep explainability for AI-driven recommendations.
- Deliver a sleek, hardware-accelerated, Apple-level premium UI.

---

## 1. System Architecture

**Frontend (Next.js + React + Framer Motion + WebGL)**
↓ *WebSockets / REST API (FastAPI Payload)*
**API Gateway & Orchestration Layer (FastAPI)**
↓ *Event Bus (Redis Pub/Sub / Kafka)*
**Core Services:**
- Graph Engine (In-memory dicts/NetworkX + DB Sync)
- Simulation Engine (Discrete Event Simulation)
- Causal Reasoner (DoWhy / CausalAI)
- Optimization Engine (OR-Tools)
- Decision Comparator
↓
**Database & Caching Layer:**
- Neo4j (Graph Persistence & Deep Traversal)
- PostgreSQL (User Auth, Scenarios, Audit Logs, Transactional Data)
- Redis (Session Caching, In-Memory Graph Snapshots, High-speed Pub/Sub)

---

## 2. Tech Stack

### Frontend
- **Next.js 14** (App Router, Server Actions)
- **TypeScript** (Strict mode)
- **TailwindCSS** (Utility-first styling)
- **Framer Motion** (Micro-interactions and fluid layout transitions)
- **Deck.gl / React Force Graph** (WebGL-accelerated rendering for 10k+ node macro views)
- **React Flow** (For detailed, zoomed-in local subgraph editing)
- **Zustand** (Rapid client-side state management for live simulations)
- **shadcn/ui** (Accessible, customizable component baseline)
- **WebSockets** (Real-time telemetry and metrics streaming)

*Design Principles: Minimalist, glassmorphism elements, hardware-accelerated 60fps animations, soft drop-shadows, strict typographic hierarchy (Inter/Geist), dark-mode native.*

### Backend
- **Python 3.11+**
- **FastAPI** (Async API, typed interfaces)
- **Pydantic v2** (High-performance data validation)
- **Neo4j** (Graph database for structural queries)
- **PostgreSQL** (Relational data, settings, history)
- **Redis** (Message brokering and low-latency cache)
- **Celery** (Distributed task queue for long-running simulations)
- **NetworkX / PyTorch Geometric** (In-memory graph math and embeddings)
- **DoWhy / EconML** (Causal inference libraries)
- **Google OR-Tools** (Combinatorial optimization)
- **Docker & Docker Compose** (Containerization)

---

## 3. Core Engines

### 3.1 Graph Modeling Engine
**Node Types:** Warehouse, Factory, Transport Hub, Port, Customer, Supplier.
**Node Attributes:** `capacity`, `inventory_level`, `processing_time`, `baseline_risk_score`, `delay_probability`, `geocoordinates`.
**Edge Attributes:** `transit_time`, `cost`, `congestion_index`, `disruption_probability`.
**APIs:**
- CRUD operations (Nodes, Edges, Subgraphs)
- Batch Import / Export (CSV/JSON/Parquet)
- Graph Snapshotting (Versioned states for rollback)

### 3.2 Simulation Engine
- Discrete Time-Step Simulation (Event-driven)
- Disruption Injector (Macro shocks, micro delays)
- Probabilistic Failure Propagation
- Live streaming of node/edge capacity metrics via WebSockets
- Horizontally scaled via Celery workers for Monte Carlo runs

**Endpoints:**
- `POST /simulate/start`
- `POST /simulate/inject-shock`
- `GET /simulation/{id}/status`
- `WS /simulation/{id}/stream`

### 3.3 Causal Reasoning Engine
- Root Cause Analysis (Backtracing anomalies)
- Impact Chain Propagation (Forward tracing)
- Compute Counterfactuals and Confidence Scores
- Structural Causal Modeling (SCM)
- Pearlian `do-calculus` intervention simulations

### 3.4 Optimization Engine
- Capacitated Vehicle Routing Problem (CVRP) solving
- Inventory Rebalancing & Safety Stock Optimization
- Cost Abatement Minimization
- Built with Google OR-Tools

**Endpoint:**
- `POST /optimize/scenario`

### 3.5 Human vs. AI Comparator
- Interface for manual human intervention inputs
- Parallel branching of simulation (Human branch vs. AI branch)
- Real-time comparison delta (Cost, Delay, Resilience Score)
- Structured post-mortem comparison output

---

## 4. Frontend Modules

- **Macro/Micro Graph Canvas:** WebGL for full network view, React Flow for zoomed-in subset editing.
- **HUD Metrics Dashboard:** Floating glassmorphism panels for live KPIs.
- **Simulation Control Panel:** Play/Pause/Rewind timeline, disruption toggles.
- **Explainability Drawer:** Steps through the "why" of an AI recommendation.
- **Split-Screen Comparator:** Visual and tabular comparison of AI vs. Human strategies.

*Features: Animated edge flows representing volume, heat-maps for congestion, timeline scrubbing, 3D/2D projection toggle.*

---

## 5. Performance Requirements

- **Scale:** Support continuous rendering and state tracking of 10,000+ nodes and 50,000+ edges.
- **Rendering:** Maintain 60fps on the frontend using WebGL offloading.
- **Backend Latency:** < 50ms API response time for non-simulation endpoints.
- **Sim Compute:** Utilize Redis caching and in-memory dicts/NetworkX to bypass DB I/O during active simulation ticks.

---

## 6. Folder Structure

### Backend
```text
backend/
├── app/
│   ├── main.py              # FastAPI entry point
│   ├── api/                 # Route handlers (v1)
│   ├── core/                # Config, security, DB connections
│   ├── engines/             # Graph, Causal, Sim, Opt logic
│   ├── models/              # DB ORM schemas
│   ├── schemas/             # Pydantic validation models
│   ├── services/            # Business logic layer
│   └── workers/             # Celery tasks
├── tests/
├── pyproject.toml
└── Dockerfile
```

### Frontend
```text
frontend/
├── src/
│   ├── app/                 # Next.js App Router
│   ├── components/
│   │   ├── ui/              # shadcn UI elements
│   │   ├── graph/           # React Flow / WebGL canvas
│   │   └── dashboard/       # Control panels
│   ├── lib/                 # Utils, API clients
│   ├── hooks/               # Custom React hooks
│   ├── store/               # Zustand slices
│   └── styles/              # Tailwind global css
├── public/
├── package.json
└── tailwind.config.ts
```

---

## 7. API Contract Format

**Standard JSON Response Wrapper:**
```json
{
  "status": "success",
  "data": { ... },
  "meta": {
    "request_id": "req_123456",
    "timestamp": "2026-02-28T12:00:00Z",
    "pagination": { ... }
  },
  "error": null
}
```

---

## 8. Security & Authentication

- **Auth:** JWT-based authentication (OAuth2 / OpenID Connect).
- **RBAC:** Role-Based Access Control (Admin, Analyst, Viewer).
- **Data:** At-rest encryption for sensitive supplier DBs.
- **API Security:** Rate limiting, CORS, and structural payload validation.

---

## 9. Testing & QA

- **Unit Testing:** PyTest for backend, Vitest + React Testing Library for frontend.
- **Integration:** API contract testing to ensure frontend/backend parity.
- **Simulation Stress Tests:** Monte Carlo runs checking for memory leaks in Celery workers.
- **Chaos Engineering:** Injecting faults into the backend (e.g., Redis outage) to ensure graceful degradation.

---

## 10. DevOps & Deployment

- **Containerization:** Docker & Docker Compose for local parity.
- **Infrastructure as Code (IaC):** Terraform scripts for AWS/GCP provisioning.
- **CI/CD:** GitHub Actions for automated linting, testing, and Docker image pushes.
- **Observability:** Prometheus + Grafana or Datadog for production monitoring of simulation compute loads.

---

## 11. AI & Machine Learning Capabilities

- **Anomaly Detection:** Isolation Forests to identify unusual node behavior.
- **Delay Forecasting:** LSTM networks modeling historical transit times.
- **Risk Scoring:** Graph Neural Networks (GNN) assessing vulnerability based on network topology.
- **Causal Intervention:** `do-calculus` evaluating root causes.

---

## 12. Deliverables

1.  Production-ready FastAPI Backend.
2.  Next.js + WebGL Frontend Implementation.
3.  Dockerized Multi-Container Setup (App, DBs, Cache, Workers).
4.  Seed Dataset of 10,000 realistic supply chain nodes (auto-generated).
5.  Interactive Demo Scenario (e.g., "Suez Canal Blockage").
6.  Comprehensive README & Architecture Diagrams (Mermaid.js).
7.  OpenAPI/Swagger Documentation.
8.  Simulation User Walkthrough guide.

---

**End Goal:** Deliver an enterprise-grade, highly performant, visually stunning, and technically rigorous Digital Twin platform that surpasses industry standards in both reasoning depth and user experience.
