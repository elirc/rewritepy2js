# Fullstack Contract Boundaries

This module explores the interface contract between the backend API and client-side frontends. Since this repository is a single-stack Python backend, this document outlines how the boundaries are defined, how dynamic OpenAPI generation operates, and how enterprise engineering teams prevent interface drift.

---

## 🚫 Status: N/A — Single-Stack Backend

This repository represents a pure API service. There is no frontend user interface, bundling system, or shared Node/Python schema package. 

However, in enterprise environments, **the contract boundary between the backend and the frontend is the single most common source of production bugs and developer velocity loss.** Below is a deep dive into how FastAPI bridges this gap.

---

## 📡 The Dynamic Contract Centerpiece: OpenAPI (`docs.json`)

FastAPI solves contract definitions natively. Instead of writing separate YAML files (which drift from the code instantly), FastAPI **generates the OpenAPI schema dynamically at runtime** directly from Pydantic schemas and route signatures.

### How FastAPI Dynamically Generates OpenAPI
In [app/main.py:23-34](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/main.py#L23-L34):
```python
app.openapi_schema = get_openapi(
    title="Conduit API",
    version="1.0.0",
    description="Conduit API",
    contact={"name": "RealWorld - Website", "url": "https://realworld.io/"},
    license_info={
        "name": "MIT License",
        "url": "https://opensource.org/licenses/MIT",
    },
    routes=router.routes,
    servers=[{"url": "/api"}],
)
```
1.  **Reflecting Types:** During server startup, FastAPI's router inspects all registered routes (like `POST /api/articles`).
2.  **Pydantic Inspection:** It inspects the Pydantic classes declared as `Body(...)` inputs (e.g. `NewArticleRequest`) and `response_model` outputs (e.g. `SingleArticleResponse`).
3.  **JSON Schema Aggregation:** Pydantic automatically serializes its types into raw JSON Schema structures.
4.  **Exposing `docs.json`:** FastAPI combines these details into a single JSON OpenAPI document accessible at `/api/docs.json`. This document is what drives the interactive Swagger interface at `/api`.

---

## 🤝 Bridge to JS: Client-Side Codegen

In a fullstack team, a TypeScript developer does not manually write interfaces matching Python schemas. Instead, they run **OpenAPI Client Codegen** in their build step:

```bash
# Example frontend compilation command [ILLUSTRATIVE — not from this repo]
npx openapi-typescript http://localhost:8000/api/docs.json --output src/types/api.ts
```

This generates typed fetching clients automatically:
```typescript
// Auto-generated TypeScript types matching Python Pydantic schemas [ILLUSTRATIVE]
export interface NewArticleRequest {
  article: {
    title: string;
    description: string;
    body: string;
    tagList: string[];
  };
}
```

---

## 🚨 Contract Drift: The Enterprise Silent Killer

### The Scenario
A backend engineer modifies a schema in Python:
```python
# Modified in app/schemas/articles.py
class Article(BaseModel):
    # Field changed from non-nullable str to optional
    description: str | None = None 
```
If the change is committed and deployed, the TypeScript frontend still expects `article.description` to be a guaranteed `string`. When the frontend tries to render `article.description.substring(0, 10)`, the app crashes with a runtime `TypeError: Cannot read properties of null` for end users.

### How Enterprise Teams Prevent Drift
To secure this boundary, staff engineers enforce **CI/CD Contract Checks**:
1.  **The Schema Guard Stage:** A pipeline step in the backend repository boots the app in a headless test environment, curl-downloads `/api/docs.json`, and commits it as `schema.json`.
2.  **Lint Check:** If `schema.json` contains modifications, it automatically triggers a frontend PR type check. If the frontend compile fails under the updated schema, the backend merge is blocked.
3.  **Backward Compatibility Tests:** CI runs tools like `oasdiff` to compare the new OpenAPI schema with the production version, warning developers of breaking type removals.
