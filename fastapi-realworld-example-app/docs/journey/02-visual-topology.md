# Developer Onboarding Journey: Visual Topology

This module is designed for visual and spatial learners. We provide comprehensive Mermaid flowcharts mapping out our request lifecycles, database schemas, and middleware intercepts.

---

## 📡 Request Traversing Flow (Slow-Motion)

This flowchart maps the complete execution path of a `POST /api/articles` (Article Creation) request traversing our layers.

```mermaid
sequenceDiagram
    autonumber
    actor Client
    participant Express as Express (Routing Gateway)
    participant Auth as auth.ts (JWT Middleware)
    participant Zod as validate.ts (Zod Validation)
    participant Route as articles.ts (Route Handler)
    participant Repo as ArticleRepository (Persistence)
    database DB as Prisma SQLite (Storage)

    Client->>Express: POST /api/articles (Bearer JWT + JSON Body)
    Express->>Auth: Pass Headers (Authorization)
    activate Auth
    Auth->>Auth: Decrypt JWT signature & verify exp
    Auth-->>Express: req.user = { id: 123 }
    deactivate Auth

    Express->>Zod: Pass Body (NewArticleSchema)
    activate Zod
    Zod->>Zod: Validate title, body, tagList
    Zod-->>Express: req.body = validatedNewArticle
    deactivate Zod

    Express->>Route: Execute createArticle(req, res)
    activate Route
    Route->>Repo: createArticle({ title, body, tags }, authorId)
    activate Repo
    Repo->>DB: SELECT Tag names from DB
    activate DB
    DB-->>Repo: Return existing Tag records
    Repo->>DB: INSERT Article + Connect/Create Tags (Transaction)
    DB-->>Repo: Return committed Article model
    deactivate DB
    Repo-->>Route: Return raw Article entity
    deactivate Repo
    Route->>Route: Map to SingleArticleResponse DTO
    Route-->>Client: HTTP 200 OK (Serialized JSON Output)
    deactivate Route
```

---

## 🗄️ Database Entity Relation Schema

This schema maps out our relational structures, foreign keys, and junction tables managed by our Prisma ORM.

```mermaid
erDiagram
    User ||--o{ Article : "writes"
    User ||--o{ Comment : "writes"
    User ||--o{ Favorite : "favorites"
    User ||--o{ Follower : "follows/followed"
    Article ||--o{ ArticleTag : "associates"
    Article ||--o{ Favorite : "receives"
    Article ||--o{ Comment : "contains"
    Tag ||--o{ ArticleTag : "maps"

    User {
        int id PK
        string username UNIQUE
        string email UNIQUE
        string password
        string bio
        string image
        datetime createdAt
        datetime updatedAt
    }

    Article {
        int id PK
        int authorId FK
        string title
        string slug UNIQUE
        string description
        string body
        datetime createdAt
        datetime updatedAt
    }

    Tag {
        int id PK
        string name UNIQUE
    }

    Comment {
        int id PK
        int articleId FK
        int authorId FK
        string body
        datetime createdAt
        datetime updatedAt
    }
```

---

## 🚪 Middleware Intercept Boundary

The pipeline below details the precise middleware execution chain that protects private routes:

```
[ HTTP Request ] 
       │
       ▼
┌──────────────────────────────┐
│  Auth Middleware (JWT Check) │
├──────────────────────────────┤
│  • Token missing? ───► 401   │
│  • Token expired? ───► 401   │
│  • User deleted?  ───► 401   │
└──────────────┬───────────────┘
               │ (req.user attached)
               ▼
┌──────────────────────────────┐
│   Zod Schema Validation      │
├──────────────────────────────┤
│  • Invalid body? ────► 422   │
│  • Missing title? ───► 422   │
└──────────────┬───────────────┘
               │ (Safe, clean payload)
               ▼
┌──────────────────────────────┐
│    Route Controller Handler  │
└──────────────────────────────┘
```
