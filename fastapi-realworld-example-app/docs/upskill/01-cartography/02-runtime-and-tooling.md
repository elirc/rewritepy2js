# Runtime and Tooling Topology

This module details the runtime systems, dependency configurations, test runners, linters, compilation parameters, and environmental boundaries of this FastAPI backend.

---

## 🛠️ Tooling & Dependency Architecture

This application manages dependencies, builds, tests, formatting, and type-checking using a modern, lightweight Python toolchain.

### 1. Package Manager: `uv`
*   **The Tool:** Configured in `uv.lock`, `pyproject.toml`, and `mise.toml`.
*   **Function:** `uv` is a blazingly fast, Rust-compiled replacement for pip, pip-tools, and poetry. It resolves and locks dependencies inside an isolated local space.
*   **Node Equivalent:** `pnpm` (which isolates node_modules and resolves lock files with peak efficiency).

### 2. Dependency Specification: `pyproject.toml`
*   **The Tool:** Found in [pyproject.toml](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/pyproject.toml).
*   **Function:** Declares core metadata, author info, strict Python version limits (`requires-python = ">=3.14"`), core dependencies (e.g. `fastapi`, `sqlalchemy`), dev groups (e.g. `pytest`, `ruff`, `mypy`), and engine parameters.
*   **Node Equivalent:** `package.json` + configuration files (like tsconfig, eslintrc).

### 3. Test Runner: `pytest`
*   **The Tool:** Configured under `[tool.pytest]` in [pyproject.toml](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/pyproject.toml#L40) and test suites in `tests/`.
*   **Function:** Discovers and runs tests asynchronously. Utilizes `pytest-asyncio` to natively execute async/await test blocks with function-scoped loops.
*   **Node Equivalent:** `vitest` / `jest`.

### 4. Linter & Formatter: `ruff`
*   **The Tool:** Configured under `[tool.ruff]` in [pyproject.toml](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/pyproject.toml#L44).
*   **Function:** A Rust-based Python linter and formatter that replaces Flake8, Black, isort, and bandit. It enforces 120-character line lengths and runs import sorting automatically.
*   **Node Equivalent:** `eslint` + `prettier` combined.

### 5. Static Type Checker: `mypy`
*   **The Tool:** Configured under `[tool.mypy]` in [pyproject.toml](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/pyproject.toml#L36).
*   **Function:** Performs static analysis to verify type safety across all annotated functions (checking signatures, generics, and return values).
*   **Node Equivalent:** `tsc --noEmit`.

---

## 🏃 Runtime & Deployment Boundaries

1.  **Deployment Model:** The application boots as an asynchronous **ASGI (Asynchronous Server Gateway Interface)** server, typically wrapped in `uvicorn` (an async web server engine).
2.  **Runtime Boundaries:**
    *   **Main Application Thread:** A single thread running an asynchronous event loop (handled by `asyncio`). It context-switches between concurrent database awaits.
    *   **Edge / Worker Layers:** The app does not compile to Edge functions. It requires a persistent containerized runtime environment (like Docker / compose) to maintain database connection pools.
    *   **Client Boundary:** The API operates headless. No HTML rendering occurs inside the Python boundaries.

---

## 🔑 Environmental Parameters

Below are the key environment variables that control this application:

| Env Var | Target Scope / Control Parameter | Production Behavior | Testing Behavior |
|---|---|---|---|
| **`DATABASE_URL`** | Controls connection credentials, host address, and target database database for writes. | Production PostgreSQL Cluster (`postgresql+psycopg://...`) | Isolated Local SQLite/PostgreSQL memory test instance (`sqlite+aiosqlite://` or local dev test DB). |
| **`DATABASE_RO_URL`** | Specifies connection credentials for the read-only replica cluster database. | Intercepts all query calls, routing them to isolated read replicas. | Typically maps back to the same DB as the write engine to prevent lag. |
| **`PYTHON_ENVIRONNEMENT`**| Controls server debugging layers, configuration loading, and testing overrides. | Set to `"production"` (disables Swagger docs, enables maximum connection pools). | Explicitly set to `"testing"` in [tests/conftest.py:13](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/tests/conftest.py#L13) (mocks external assets, truncates tables after run). |
| **`SECRET_KEY`** | Secret seed used by the crypto library to sign JWT authorization tokens. | Loaded from vault/secrets management (high entropy string). | Mocked or hardcoded static string. |
