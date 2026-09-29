# Developer Onboarding Journey: Conceptual Architectural Overview

Welcome to the Conduit Node.js / TypeScript engineering team. This documentation maps out the conceptual layers, interface boundaries, and architectural strategies of our rewritten backend.

---

## 🏛️ Architectural Taxonomy & Clean Boundaries

Our application follows **Clean Architecture** principles, strictly segregating technical concerns to reduce horizontal blast radius and ensure maximum extensibility.

```
+-------------------------------------------------------------------+
|                     1. HTTP Transport Layer                       |
|           (Express Routes, Request/Response Controllers)          |
+-------------------------------------------------------------------+
                                 │
                                 ▼
+-------------------------------------------------------------------+
|                    2. Validation & Security                       |
|                 (Zod Schemas, JWT Auth Guards)                    |
+-------------------------------------------------------------------+
                                 │
                                 ▼
+-------------------------------------------------------------------+
|                    3. Business Domain / Service                   |
|                (Express Route Controller Handlers)                |
+-------------------------------------------------------------------+
                                 │
                                 ▼
+-------------------------------------------------------------------+
|                    4. Persistence Repository                      |
|                  (Prisma Repositories, Models)                    |
+-------------------------------------------------------------------+
                                 │
                                 ▼
+-------------------------------------------------------------------+
|                      5. Data Storage (SQL)                        |
|                  (SQLite / PostgreSQL Engine)                     |
+-------------------------------------------------------------------+
```

### 1. The HTTP Transport Layer (Routes & Controllers)
*   **Location:** `src/routes/`
*   **Nomenclature:** Routes group related functional endpoints (e.g. `articles.ts`).
*   **Responsibility:** Intercepting incoming TCP/HTTP requests, parsing URL parameters, identifying status codes, and packaging JSON payload structures.
*   **Strict Boundary Constraints:** This layer is **strictly forbidden** from writing direct SQL or executing database operations. It acts purely as a translator, decoding HTTP messages and delegating work to our persistence repositories.

### 2. Validation & Security Layer (Middleware)
*   **Location:** `src/middleware/`
*   **Responsibility:** Decrypting stateless JWT tokens and running dynamic parameter validation.
*   **Strict Boundary Constraints:** We validate all inputs using **Zod Schemas**. If a request body contains invalid parameters, our validation middleware halts execution early and automatically returns `422 Unprocessable Content`. The controller layers only receive fully verified, type-safe data shapes.

### 3. The Repository Layer (Persistence)
*   **Location:** `src/repositories/`
*   **Responsibility:** Querying the database, updating records, managing transactional queries, and loading relationship trees.
*   **Strict Boundary Constraints:** Repositories are **forbidden** from raising HTTP exceptions or importing transport-specific classes (like Express's `Response`). This ensures that if we transition our app to an offline cron CLI task or event worker, our databases interfaces can be reused without transport dependencies.

---

## 🔑 Operational Design Principles

To prepare you for staff-level contributions, here are the core design strategies we enforce:

### 1. Stateless Identity & Cryptographic Guards
Instead of storing stateful session tables on our database server, our system relies on stateless JSON Web Tokens (JWT). 
When a user logs in, we issue a signed token containing their database ID in the subject (`sub`) claim. On subsequent requests, the `auth` middleware decodes the signature. The user's ID is verified and attached directly to the request context object (`req.user`), making credentials instantly accessible to the router.

### 2. Strict IDOR (Insecure Direct Object Reference) Protection
Before executing mutable database writes (like updating articles or comments), you must always confirm that the requester owns the target record:
```typescript
if (article.authorId !== currentUser.id) {
  throw new ForbiddenError("You are not the author of this article");
}
```
Failing to verify ownership creates a severe security vulnerability, allowing any authenticated user to send a raw database mutation request and delete another developer's content.
