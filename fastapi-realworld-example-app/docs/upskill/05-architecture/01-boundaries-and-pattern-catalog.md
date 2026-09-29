# Architectural Boundaries & Pattern Catalog

This module details the architectural layers of the application, analyzes structural boundaries and boundary leaks, and provides a card catalog of 12 patterns utilized throughout the codebase.

---

## 🏗️ Layer Boundaries & Strict Ownership Rules

Clean architecture requires strict boundaries. Layers must only communicate using defined inputs and outputs, and must never leak internal types outside their designated scopes.

### 1. The Route Controller Layer (`app/api/routes/`)
*   **Ownership:** HTTP protocol boundaries. This layer owns parsing path parameters, status codes, query strings, and validating schemas.
*   **Must Not Own:** Raw SQL queries or connection configurations. It must never construct database commands directly.
*   **Boundary Leak Found:** In [app/api/routes/articles.py:94](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/api/routes/articles.py#L94), the route handler uses the slugify utility: `slugify(new_article.article.title)`. Business mapping logic like slugification belongs inside the **Domain/Repository** layer. Leakage occurs because the controller is computing slug values instead of letting `ArticlesRepository.create` handle internal string formats.

### 2. The Dependency Injection Layer (`app/api/deps.py`)
*   **Ownership:** Resource lifecycle orchestration (e.g., database connection yields, request authorization extraction).
*   **Must Not Own:** Business rules. It should verify if a token is valid, but must not execute business logic (e.g. checking if a user has permission to write a specific comment).

### 3. The Repository Layer (`app/crud/`)
*   **Ownership:** Database queries, filters, eager loadings, writes, and transactional boundaries.
*   **Must Not Own:** HTTP exceptions. Raising an `HTTPException(status_code=404)` inside a repository binds the data layer to the HTTP transport layer. If we reuse the repository inside a background worker CLI task, the CLI task would crash with an HTTP transport error. The repository must raise domain-specific exceptions (e.g. `RecordNotFoundError`) and let the controller catch them and return HTTP statuses.

---

## 🎴 Architectural Pattern Catalog

Below are 12 pattern cards utilized throughout the codebase:

---

### ## Pattern 1: Route Controller / Handler
*   **Problem it solves:** Decouples incoming HTTP requests from the underlying controller logic.
*   **JS name ↔ Python name:** Express Router (`router.get`) ↔ FastAPI APIRouter (`@router.get`).
*   **Real example:** [app/api/routes/articles.py:33](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/api/routes/articles.py#L33) · **Second:** [app/api/routes/auth.py:10](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/api/routes/auth.py#L10).
*   **Failure modes:** Placing complex business logic or database writes directly inside the route function.
*   **Drill:** Create a new route in a route file and ensure it only maps parameters and delegates execution to a repository.

---

### ## Pattern 2: Dynamic Dependency Injection
*   **Problem it solves:** Resolves resource lifetimes (e.g. database sessions) dynamically before executing handler functions.
*   **JS name ↔ Python name:** NestJS Providers (`@Inject()`) ↔ FastAPI Dependency (`Depends()`).
*   **Real example:** [app/api/deps.py:102](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/api/deps.py#L102) · **Second:** [app/api/deps.py:75](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/api/deps.py#L75).
*   **Failure modes:** Instantiating connections inside dependencies without closing them.
*   **Drill:** Inspect [app/api/deps.py](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/api/deps.py) and map how `get_articles_service` relies on `SessionDatabase` and `SessionDatabaseRo`.

---

### ## Pattern 3: Data Transfer Object (DTO) Serialization
*   **Problem it solves:** Validates structure constraints of HTTP payloads and serializes output database schemas securely.
*   **JS name ↔ Python name:** Zod Schema (`z.object()`) ↔ Pydantic Model (`BaseModel`).
*   **Real example:** [app/schemas/articles.py:7](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/schemas/articles.py#L7) · **Second:** [app/schemas/users.py:23](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/schemas/users.py#L23).
*   **Failure modes:** Adding direct database write functions or raw ORM behaviors to schema models.
*   **Drill:** Create a Pydantic schema that requires an alphanumeric password of minimum 8 characters.

---

### ## Pattern 4: Repository Pattern
*   **Problem it solves:** Decouples data retrieval and persistence from business controllers.
*   **JS name ↔ Python name:** TypeORM Custom Repository ↔ Repository Class.
*   **Real example:** [app/crud/crud_article.py:18](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/crud/crud_article.py#L18) · **Second:** [app/crud/crud_user.py:10](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/crud/crud_user.py#L10).
*   **Failure modes:** Leaking SQL connection references outside the class scope.
*   **Drill:** Find another instance of the Repository pattern under `app/crud/`.

---

### ## Pattern 5: Data Mapper ORM Entity
*   **Problem it solves:** Maps relational tables directly to object-oriented memory instances.
*   **JS name ↔ Python name:** Prisma Schema model / TypeORM Entity ↔ SQLAlchemy Base Model.
*   **Real example:** [app/models/article.py:44](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/models/article.py#L44) · **Second:** [app/models/user.py:36](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/models/user.py#L36).
*   **Failure modes:** Storing raw database transactions directly inside the entity instance scope.
*   **Drill:** Map a new table relationship on `Comment` referencing a user follow state.

---

### ## Pattern 6: Paginated Search Builder
*   **Problem it solves:** Abstracting paginated listings and count queries cleanly.
*   **JS name ↔ Python name:** Prisma pagination ↔ Paginated builder.
*   **Real example:** [app/crud/crud_article.py:82](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/crud/crud_article.py#L82) · **Second:** "none found".
*   **Failure modes:** Running list fetches and count queries sequentially instead of in parallel.
*   **Drill:** Inspect how `query.subquery()` is generated in `get_paginated_list`.

---

### ## Pattern 7: Database Replication Routing (Read-Write Isolation)
*   **Problem it solves:** Separates write operations from intensive read operations to scale connection footprints.
*   **JS name ↔ Python name:** Dual client engines ↔ Dual engines (SessionLocal / SessionLocalRo).
*   **Real example:** [app/db/session.py:5-9](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/db/session.py#L5-L9) · **Second:** [app/api/deps.py:75-84](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/api/deps.py#L75-L84).
*   **Failure modes:** Performing a database write inside a replica connection block (raises read-only exception).
*   **Drill:** Identify which repository constructor parameters receive the read replica session context.

---

### ## Pattern 8: Asynchronous Context Resource Management
*   **Problem it solves:** Guarantees connection cleanup on loops and exceptions.
*   **JS name ↔ Python name:** try...finally block ↔ async with statement.
*   **Real example:** [app/crud/crud_article.py:87](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/crud/crud_article.py#L87) · **Second:** [app/api/deps.py:19-23](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/api/deps.py#L19-L23) (equivalent via yield).
*   **Failure modes:** Forgetting to wrap manual queries, resulting in connection leaks.
*   **Drill:** Wrap a mock write session in an async context block.

---

### ## Pattern 9: Dynamic Slugification Filter
*   **Problem it solves:** Formulates unique human-readable URL identifiers dynamically.
*   **JS name ↔ Python name:** slugify package ↔ python-slugify.
*   **Real example:** [app/api/routes/articles.py:94](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/api/routes/articles.py#L94) · **Second:** [app/crud/crud_article.py:99](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/crud/crud_article.py#L99).
*   **Failure modes:** Running slugify inside route handlers, leaking business logic.
*   **Drill:** Refactor [app/api/routes/articles.py:94](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/api/routes/articles.py#L94) to delegates slugification to `ArticlesRepository.get_by_slug` or repository internals.

---

### ## Pattern 10: JSON Case Conversion Transformer
*   **Problem it solves:** Decouples internal snake_case parameters from public camelCase JSON payloads.
*   **JS name ↔ Python name:** camelcase-keys package ↔ alias_generator = to_lower_camel.
*   **Real example:** [app/schemas/base.py:8-19](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/schemas/base.py#L8-L19) · **Second:** "none found".
*   **Failure modes:** Forgetting to inherit from custom `BaseModel`, leaking internal snake_case variables.
*   **Drill:** Trace how `created_at` in Python ORM becomes `createdAt` in API JSON output.

---

### ## Pattern 11: One-Way Cryptographic Hashing
*   **Problem it solves:** Protects passwords in transit/rest by running one-way encryption.
*   **JS name ↔ Python name:** bcrypt package ↔ bcrypt library.
*   **Real example:** [app/crud/crud_user.py:28](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/crud/crud_user.py#L28) · **Second:** [app/core/security.py:29-37](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/core/security.py#L29-L37).
*   **Failure modes:** Using weak hash algorithms or MD5.
*   **Drill:** Inspect how `verify_password` hashes values inside [app/core/security.py](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/core/security.py).

---

### ## Pattern 12: Stateless JWT Verification
*   **Problem it solves:** Authenticates client requests statelessly.
*   **JS name ↔ Python name:** jsonwebtoken package ↔ python-jose / jwt.
*   **Real example:** [app/api/deps.py:34-45](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/api/deps.py#L34-L45) · **Second:** [app/core/security.py:11-26](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/core/security.py#L11-L26).
*   **Failure modes:** Storing sensitive values (like passwords) inside token payloads, or omitting signature checks.
*   **Drill:** Identify where `SECRET_KEY` is loaded inside [app/core/security.py](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/core/security.py).
