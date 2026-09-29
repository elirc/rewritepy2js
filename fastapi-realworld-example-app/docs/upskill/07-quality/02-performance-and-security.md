# Performance & Security Topology

This module provides a detailed review of the system's performance bottlenecks, connection pool dynamics, and core security concerns.

---

## ⚡ Performance Architecture & Bottlenecks

Staff engineers ensure that backend systems maintain low sub-100ms API response latencies even under horizontal load. Below is an audit of the primary performance challenges:

---

### Bottleneck 1: Sequential Tag N+1 Queries during Write Transactions
*   **The Flaw:** In [app/crud/crud_article.py:101-105](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/crud/crud_article.py#L101-L105), the tag upsert loop queries the database for each tag name sequentially inside an active write transaction.
*   **Detection via SQL Logging:** To expose this in local environments, configure SQLAlchemy to print SQL execution statements by setting `echo=True` inside the database connection engine. When creating an article with 5 tags, the terminal will print:
    ```sql
    -- Query 1 (Article slug check)
    SELECT articles.id AS articles_id, ... FROM articles WHERE articles.slug = 'my-title';
    -- Query 2 (Tag 1 check)
    SELECT tags.id AS tags_id, tags.name AS tags_name FROM tags WHERE tags.name = 'tag1';
    -- Query 3 (Tag 2 check)
    SELECT tags.id AS tags_id, tags.name AS tags_name FROM tags WHERE tags.name = 'tag2';
    -- ... Repeated 5 times ...
    ```
*   **Refactored Optimization:** Query all tags in a single read, resolving relationships in-memory before committing. See the [refactored optimization diff](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/docs/upskill/06-architecture-critique.md#critique-3-sequential-n1-sql-insert-operations-on-tags) inside the Architecture Critique module.

---

### Bottleneck 2: Lazy Loading Relation Queries (N+1 Reads)
*   **The Flaw:** If eager loading options (`options(joinedload(...))`) are omitted when fetching article listings, accessing nested fields during response serialization (e.g. mapping `article.author.name`) will trigger separate lazy queries.
*   **Real Example:** In [app/crud/crud_article.py:73-77](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/crud/crud_article.py#L73-L77), the repository correctly resolves this using explicit joins:
    ```python
    .options(
        joinedload(Article.author).joinedload(User.followers),
        joinedload(Article.tags),
        joinedload(Article.favorited_by),
    )
    ```
*   **Why this is critical:** If omitted, fetching a feed list of 50 articles would fire 50 redundant SQL statements to retrieve author profiles sequentially, degrading API performance and saturating database connection channels.

---

### Bottleneck 3: Connection Pool Exhaustion under Horizontal Load
*   **The Flaw:** Utilizing the dynamic parallel gather strategy (`asyncio.gather`) across dual connections doubles the required connection pool footprint per request.
*   **Connection Pool Configuration:** The connection pooling parameters are defined when instantiating the async connection engines:
    ```python
    # [INFERRED]
    engine = create_async_engine(
        DATABASE_URL,
        pool_size=20,          # Keeps 20 persistent connections ready in memory
        max_overflow=10,       # Allows up to 10 additional temporary overflow connections
        pool_timeout=30,       # Blocks connection requests for max 30 seconds before failing
        pool_recycle=1800,     # Recycles connection pipes every 30 minutes to prevent stales
    )
    ```
*   **TS Equivalent:** Instantiating the Prisma client connection limit parameters: `postgresql://user:pass@host/db?connection_limit=20&pool_timeout=30`.

---

## 🛡️ Security Topology & Audits

Below are three distinct security audits targeting configuration layers in this codebase:

---

### Concern 1: Predictable JWT Signing Key Injection (Identity Theft)
*   **The Flaw:** The cryptographical utility decodes JWT signatures in [app/core/security.py:11-26](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/core/security.py#L11-L26) relying on a loaded configuration key:
    ```python
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    ```
*   **Exploit Scenario:** If the deployment pipeline defaults to a static, predictable fallback key (e.g. `"SECRET_KEY_FALLBACK"`), a malicious actor can sign a forged JWT payload with the subject claim set to `admin` or target user IDs, completely bypassing authentication checks and accessing user accounts.
*   **Mitigation:** Enforce strict validation at server startup. If `SECRET_KEY` is not set in the environment or has low entropy (fewer than 256 bits), the server must throw an immediate configuration error and fail to boot.

---

### Concern 2: Permissive Wildcard CORS Configuration (Cross-Origin Leaks)
*   **The Flaw:** In [app/main.py:12-16](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/main.py#L12-L16), CORS headers are configured using wildcard parameters:
    ```python
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"], # Allows requests from any origin domain globally
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    ```
*   **Exploit Scenario:** With `allow_origins=["*"]`, a malicious website visited by an authenticated user can execute background JavaScript fetch calls to this API. If the API relied on cookies, the user's sessions would be fully compromised. While JWT headers mitigate cookie extraction risks, wildcard CORS still allows malicious domains to access sensitive JSON responses if request authentication is compromised.
*   **Mitigation:** In production, restrict origins to explicitly trusted domain strings:
    ```python
    allow_origins=["https://conduit.production-frontend.com"]
    ```

---

### Concern 3: Password Brute-Force Vulnerabilities (High GPU Scaling)
*   **The Flaw:** User registration in [app/crud/crud_user.py:28](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/crud/crud_user.py#L28) hashes passwords using a helper function:
    ```python
    password=get_password_hash(obj_in.password)
    ```
*   **Exploit Scenario:** If the bcrypt engine is configured with low work rounds (e.g. less than 10), hackers who extract the database records can run automated dictionary attacks using high-scaling modern GPU clusters, decoding user passwords in minutes.
*   **Mitigation:** Verify that the cryptographical provider enforces at least 12 salt rounds, ensuring offline brute-forcing requires immense, impractical computational power.
