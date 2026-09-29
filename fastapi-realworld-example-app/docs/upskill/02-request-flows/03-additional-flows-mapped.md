# Request Flows: Core API Routes Mapped

This module maps out three additional core request flows in the system, providing complete architectural coverage of the application's execution model.

---

## 🔐 Flow 1: User Login (`POST /api/users/login`)

**Why this flow matters:** This handles user authentication, illustrating database lookups via email, password hashing and verification using `bcrypt`, and the dynamic creation of signed JSON Web Tokens (JWT).

### 📊 Execution Trace Table

| Step | Owner (file:line) | What happens | Data shape | Risk |
|---|---|---|---|---|
| **1. Validation** | [auth.py:37](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/api/routes/auth.py#L37) | Body validator parses the credentials. | `JSON payload` → `LoginUserRequest` | Empty password bypass attempts. |
| **2. DB Query** | [crud_user.py:50](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/crud/crud_user.py#L50) | Looks up user record in read replica database session. | `email` string → `User` ORM model | DB connection drop under load. |
| **3. Crypto Check**| [crud_user.py:53](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/crud/crud_user.py#L53) | Runs `bcrypt` verification on the input password vs stored hash. | `str` + `str hash` → boolean | High-CPU utilization from slow hashing. |
| **4. Token Sign** | [user.py:71](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/models/user.py#L71) | Generates access token using a signing secret. | `User.id` integer → JWT string | Exposing secret key in source repository. |

*   **Validation / Authz:** Enforces standard Pydantic type checks (must be valid email). No Authorization headers are required.
*   **Persistence Layer:** Executes a read-only select on `users` table via `self.dbro`.
*   **Side Effects:** Crypto operations (password hashing verification via `bcrypt` and JWT encoding via `python-jose`).
*   **Tests & Risks:** Tested in `tests/test_users.py`. The primary risk is high CPU exhaustion. `bcrypt` password verification is computationally expensive by design. A DDOS attack targeting this endpoint can saturate server CPU cores.
*   **💬 Interview angle:** *"During login, we execute the query on our read-replica database (`self.dbro`) to conserve main write resources. The password verification is handled by bcrypt, and once authenticated, we create a signed JWT containing the user ID in the subject (`sub`) claim. This allows us to keep the backend stateless."*

---

## ❤️ Flow 2: Favorite Article (`POST /api/articles/{slug}/favorite`)

**Why this flow matters:** Demonstrates many-to-many intermediate association table mutations, appending relationships in ORM models, and saving changes in write database sessions.

### 📊 Execution Trace Table

| Step | Owner (file:line) | What happens | Data shape | Risk |
|---|---|---|---|---|
| **1. Auth Hook** | [favorites.py:20](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/api/routes/favorites.py#L20) | Resolves the current user. | `Bearer token` → `User` ORM | Invalid or expired token. |
| **2. Read Article**| [favorites.py:22](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/api/routes/favorites.py#L22) | Gets article using slug. | `slug` string → `Article` ORM | Article not found (404). |
| **3. Association** | [crud_article.py:131](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/crud/crud_article.py#L131) | Appends user ORM reference to `article.favorited_by`. | `User` added to list relationship | Duplicate entry attempt raises exception. |
| **4. Commit** | [crud_article.py:136](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/crud/crud_article.py#L136) | Merges state changes and commits transaction. | `db.merge` → SQL INSERT | Lock timeout on `article_favorite` table. |

*   **Validation / Authz:** Auth is strictly required (`CurrentUser`). Parameter verification requires a valid slug string.
*   **Persistence Layer:** Executes a SQL `INSERT` into the `article_favorite` junction table via ORM relation mappings.
*   **Side Effects:** Modifies association counts, which updates pagination calculations globally.
*   **Tests & Risks:** High transactional lock risks. If multiple users favorite the exact same article simultaneously, write locks on the intermediate association table row contexts can queue up, resulting in connection deadlocks.
*   **💬 Interview angle:** *"To favorite an article, we append the User entity directly to the `article.favorited_by` relationship collection. SQLAlchemy detects this modification on flush and automatically performs a clean write to the intermediate `article_favorite` table, preventing us from writing raw join SQL."*

---

## 👤 Flow 3: Get Profile (`GET /api/profiles/{username}`)

**Why this flow matters:** Traces profile retrievals with optional authentication, showing self-referential joints to verify if a user follows the profiled user.

### 📊 Execution Trace Table

| Step | Owner (file:line) | What happens | Data shape | Risk |
|---|---|---|---|---|
| **1. Optional Auth**| [profiles.py:22](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/api/routes/profiles.py#L22) | Decodes JWT optional header. | `Header` → `User \| None` | Token corrupted yields 403 instead of None. |
| **2. Target Query** | [profiles.py:24](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/api/routes/profiles.py#L24) | Looks up profiling user by username. | `username` string → `User` ORM | User not found (404). |
| **3. Join Mapping** | [user.py:79](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/models/user.py#L79) | Runs `self.followers.__contains__(user)` check. | `followers` relation check → bool | Lazy-load queries trigger on every load. |

*   **Validation / Authz:** Auth is optional (`OptionalCurrentUser`). If present, `following` evaluates to `true` or `false`; if absent, it defaults to `false`.
*   **Persistence Layer:** Runs a select with `joinedload` on follower joints using the read replica connection context (`self.dbro`).
*   **Side Effects:** None.
*   **Tests & Risks:** Lazy-load leaks. If the profiled user has millions of followers, evaluating `self.followers.__contains__(user)` without filtering could cause the ORM to pull all followers into memory.
*   **💬 Interview angle:** *"To profile a user, we execute a query on our read-replica database. To determine if the current user is following them, we check the relation using SQLAlchemy's collections framework, mapping it to a Profile Pydantic schema model."*
