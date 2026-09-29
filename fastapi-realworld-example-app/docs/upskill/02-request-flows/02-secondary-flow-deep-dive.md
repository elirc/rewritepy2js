# Request Flow Deep-Dive: Get Articles Feed

This module details the request execution lifecycle of retrieving the personalized article feed. We will trace how a client requests filtered content, how FastAPI dependencies inject and authorize the user, and how the database layer uses parallel asynchronous queries on read replicas to count and select records.

---

## Flow: Articles Personalized Feed (`GET /api/articles/feed`)

**Why this flow matters:** This is the primary read query in the application. It highlights modern Python asynchronous optimization, performing database pagination and counting in parallel (`asyncio.gather`) across a read-replica database session (`SessionLocalRo`), and executing a self-referential joint check (verifying if an author is followed by the current user).

**Bridge equivalent:** A feed query endpoint in NestJS/Express using Prisma to query `prisma.article.findMany({ where: { author: { followers: { some: { id: userId } } } }, include: { author: true, tags: true } })`.

---

### Step 1: Endpoint Route Entry and Credential Validation
- **Triggered by:** The client sends an HTTP `GET` request to `/api/articles/feed` with `limit` (default 20) and `offset` (default 0) query parameters and a `Bearer <token>` Authorization header.
- **Owner:** [app/api/routes/articles.py:62-74](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/api/routes/articles.py#L62-L74)
- **Annotated code:**
  ```python
  @router.get(
      "/feed",
      operation_id="GetArticlesFeed",
      summary="Get recent articles from users you follow",
      description="Get most recent articles from users you follow. Use query parameters to limit. Auth is required",
      response_model=MultipleArticlesResponse,
  )
  async def get_feed(
      current_user: CurrentUser, # Requires authentication (unlike global articles listing which is optional)
      limit: int = Query(20, title="Limit number of articles returned (default is 20)"),
      offset: int = Query(0, title="Offset/skip number of articles (default is 0)"),
      articles: ArticlesRepository = Depends(get_articles_service), # Repository dependency
  ) -> MultipleArticlesResponse:
  ```
- **Data in → out:** 
  *   **In:** HTTP Request URL `/api/articles/feed?limit=10&offset=0` and authorization header.
  *   **Out:** Fully instantiated dependency types: `current_user` (`User` class instance), `limit` (integer `10`), `offset` (integer `0`), and `articles` (`ArticlesRepository` instance).
- **Why here, not elsewhere:** Router enforces route configuration rules (e.g., auth required). By using Pydantic serialization models here (`response_model=MultipleArticlesResponse`), it guarantees response data shape compliance.
- **Fails if:**
  *   No token is present or is malformed (returns `403 Forbidden`).
  *   The `limit` query parameter is not an integer (returns `422 Unprocessable Entity`).
- **💬 Interview angle:** *"In Express, authentication is often configured at the router middleware level (`router.use(auth)`). In FastAPI, we declare it directly inside the handler signature (`current_user: CurrentUser`). This gives self-documenting parameters and auto-generated Swagger schema documentation."*
- **Bridge:** Express routing with validation: `router.get("/feed", authenticateJWT, validateQuery, (req, res) => { ... })`.

---

### Step 2: Formulating Follower Join Query & Eager Loading
- **Triggered by:** The route handler starts and calls the repository's `get_feed(...)` function.
- **Owner:** [app/crud/crud_article.py:69-80](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/crud/crud_article.py#L69-L80)
- **Annotated code:**
  ```python
  async def get_feed(self, limit: int, offset: int, *, user: User) -> tuple[Sequence[Article], int]:
      # Define base query select for Article
      query = (
          select(Article)
          .options(
              # 1. joinedload forces SQLAlchemy to perform a SQL JOIN rather than lazy-loading later
              joinedload(Article.author).joinedload(User.followers),
              joinedload(Article.tags),
              joinedload(Article.favorited_by),
          )
          # 2. Filter articles where the author's followers relationship contains the current user ID
          .filter(Article.author.has(User.followers.any(id=user.id)))
      )
  ```
- **Data in → out:** 
  *   **In:** `limit` (`10`), `offset` (`0`), and `user` (authenticated `User` ORM instance).
  *   **Out:** A SQLAlchemy `Select` statement object.
- **Why here, not elsewhere:** Encapsulates query logic within the Repository layer. Routes do not need to understand SQL join operations or relationships.
- **Fails if:** Database relationships are misconfigured (raises compilation errors during SQL assembly).
- **Goes deeper in:** [07-quality/02-performance-and-security.md](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/docs/upskill/07-quality/02-performance-and-security.md) for how N+1 query patterns are resolved via `joinedload`.
- **💬 Interview angle:** *"Notice the use of `.options(joinedload(Article.author))` here. If we omit this, SQLAlchemy will only fetch the articles. When we map details in-memory, accessing `article.author` will trigger a separate SELECT query for every single article, causing an N+1 performance bottleneck. Eager loading combines these in a single outer join query."*
- **Bridge:** Similar to using the `include` parameters in Prisma: `prisma.article.findMany({ include: { author: true } })`.

---

### Step 3: Executing Parallel Queries on Read Replica Session
- **Triggered by:** The base feed query is compiled and passed to `get_paginated_list`.
- **Owner:** [app/crud/crud_article.py:82-92](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/crud/crud_article.py#L82-L92)
- **Annotated code:**
  ```python
  async def get_paginated_list(
      self, limit: int, offset: int, query: Select[tuple[Article]]
  ) -> tuple[Sequence[Article], int]:
      # 1. Apply pagination parameters and order desc by ID
      query_list = query.order_by(desc(Article.id)).limit(limit).offset(offset)

      # 2. Open an independent read-only database connection context
      async with SessionLocalRo() as db_count:
          # Create a subquery count statement to get total matching records count
          query_count = select(func.count()).select_from(query.subquery())

          # 3. CONCURRENCY OPTIMIZATION: execute counting and pagination list queries concurrently
          articles, count = await asyncio.gather(
              self.dbro.scalars(query_list), # Executed on self.dbro (read-only session)
              db_count.scalar(query_count)  # Executed on new session to prevent thread conflicts
          )

      # unique() ensures deduplication in memory due to outer joins
      return articles.unique().all(), count or 0
  ```
- **Data in → out:** 
  *   **In:** Paged SQLAlchemy `Select` statements.
  *   **Out:** A tuple: `(Sequence[Article], count)` containing the list of database article models and total count.
- **Why here, not elsewhere:** Managing db connection lifetimes and concurrent gathers belongs strictly inside database transactions contexts.
- **Fails if:**
  *   `asyncio.gather` is run with two operations on the **same** database session context. SQLAlchemy connection sessions are stateful and **non-thread-safe**; executing multiple concurrent queries on a single session raises `sqlalchemy.exc.InvalidRequestError: Session is already executing a query`. This is why we open a separate session (`SessionLocalRo() as db_count`) to execute the count.
- **💬 Interview angle:** *"This is a prime example of high-concurrency optimization in Python. In typical frameworks, engineers fetch the list, await it, and then fetch the count sequentially. Here, we run both operations in parallel using `asyncio.gather`. To prevent database thread corruption, we execute them across two independent read connections."*
- **Bridge:** In Prisma, this is equivalent to running `await prisma.$transaction([prisma.article.findMany(...), prisma.article.count(...)])`.

---

### Step 4: Schema Serialization and Dispatch
- **Triggered by:** The query results are returned to the controller.
- **Owner:** [app/api/routes/articles.py:75-79](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/api/routes/articles.py#L75-L79)
- **Annotated code:**
  ```python
  return MultipleArticlesResponse(
      # Map every article ORM instance to a pydantic schema, including current user details
      articles=[article.schema(current_user) for article in result],
      articles_count=count,
  )
  ```
- **Data in → out:** 
  *   **In:** `(result, count)` tuple returned from repository.
  *   **Out:** Fully serialized JSON object matching the Conduit spec.
- **Bridge:** `res.json({ articles: result.map(a => a.serialize(user)), articlesCount: count })` in Express.

---

## 📊 Full Trace Table

| Step | Owner (file:line) | What happens | Data shape | Risk |
|---|---|---|---|---|
| **1. Session Injection** | [deps.py:26-31](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/api/deps.py#L26-L31) | Resolves the database read replica engine session. | `AsyncGenerator` → `dbro` | Connection acquisition failure. |
| **2. Auth Guard** | [deps.py:87-90](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/api/deps.py#L87-L90) | Extracts JWT from Header, decodes sub, returns User object. | `Header` → `User` | Expired token returns 403. |
| **3. Build Feed SQL** | [crud_article.py:70](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/crud/crud_article.py#L70) | Formulates relational join SQL for following relationship. | `User` → `Select` statement | Relation configuration name mismatch. |
| **4. Parallel Gathering** | [crud_article.py:90](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/crud/crud_article.py#L90) | Runs count and list queries concurrently across separate sessions. | `Select` statements → `(Sequence[Article], int)` | Reusing a single session will cause a thread crash. |
| **5. Deduplication** | [crud_article.py:92](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/crud/crud_article.py#L92) | Deduplicates relational row matches via `.unique().all()`. | `Result` → `Sequence[Article]` | Relational multiplier increases memory usage. |

---

## 💡 Key Architectural Insights

### What a JS Developer Wrongly Assumes Here
*   **"SQLAlchemy unique() functions like lodash uniq":** In JavaScript, we deduplicate objects using filters. In SQLAlchemy, because eager loading `joinedload` on relationships (like tags or comments) results in an SQL row Cartesian product (an article with 3 tags creates 3 database rows), `unique()` is **syntactically required** on async scalar listings to collapse duplicate rows back into single class instances with nested collection attributes. Failing to call `unique()` will crash the execution context with a `UniqueException`.

### What a Senior Staff Engineer Notices
*   **Replica DB Leakage Safety:** The read replica context uses separate connection engines (`SessionLocalRo`). This ensures read operations do not consume the write connection pool, which is a major enterprise scale requirement.
*   **Self-Referential Joins:** The filter condition `.filter(Article.author.has(User.followers.any(id=user.id)))` is converted into an efficient SQL `EXISTS` clause. This performs significantly faster than full-table joins in PostgreSQL.

---

## 🏋️ Drill

**Task:** Open [app/crud/crud_article.py](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/crud/crud_article.py). Rewrite `get_paginated_list` to run sequentially without parallel execution (`asyncio.gather`) or dual sessions, and note the performance difference.

### Self-Grade Rubric
*   **Basic:** You understood that parallel gathers require two sessions to prevent session overlap.
*   **Solid:** You rewrote the code to run sequentially using `self.dbro.scalars(...)` and then `self.dbro.scalar(...)` on the same database session sequentially.
*   **Strong:** You verified the sequential execution successfully, understanding that while it runs slower, it only consumes a single connection instead of two.
