# Up-skilling Suite: Fast Track (Weekend Win)

This module provides a fast-track, hands-on path to establish a local playground, run your first test, execute a safe code modification, and inspect the core execution flow of this FastAPI system.

---

## 🛠️ Environment Setup & Verification

Below are the commands to set up this playground, split by what has been strictly verified in this workspace versus what is inferred based on standard Python development.

### 1. Verification of System Tools
*   **Python Version:** Python `3.13.3` is installed and verified on this system.
*   **Test Runner:** `pytest 9.0.2` is installed and verified.
*   **Linter:** `ruff` is available in dev dependency configs.
*   **Package Manager:** The repository specifies `uv` in `uv.lock` and `mise.toml` configurations, but standard `pip` packages are already installed globally/in active scope.

### 2. Sandbox Setup Commands
If you are recreating this environment from scratch:

```powershell
# 1. Create a local virtual environment [INFERRED]
python -m venv .venv

# 2. Activate the virtual environment (Windows PowerShell) [INFERRED]
.venv\Scripts\Activate.ps1

# 3. Install core and dev dependencies [INFERRED]
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m pip install -e .
```

### 3. Running the Test Suite [VERIFIED]
To execute the tests, run:
```powershell
python -m pytest
```
*   **Current Status:** Running this command immediately surfaces a `NameError: name 'Article' is not defined` inside `app/models/comment.py:26`. This is because Python evaluates annotations at runtime, and `Comment` is imported before `Article` in `tests/conftest.py`. This is an extremely valuable learning opportunity (analyzed in depth in the Architecture & Critique modules).

---

## 🔍 The First Flow to Trace

Your absolute first entry point into this codebase is:
**The Article Creation Flow**
*   **API Router Entrypoint:** [app/api/routes/articles.py:89](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/api/routes/articles.py#L89) (`async def create(...)`)
*   **Database Interface:** [app/crud/crud_article.py:94](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/crud/crud_article.py#L94) (`async def create(...)`)

*Why this flow?* It demonstrates:
1.  **Authentication:** How FastAPI dependencies (`CurrentUser`) decode JWT authorization headers.
2.  **Validation:** How Pydantic (`NewArticleRequest`) ensures the body contains valid strings.
3.  **ORM Operations:** How SQLAlchemy manages async database sessions and writes child relations (saving tags and associating them with an article).

---

## 📂 Reading Sequence: First 10 Files

To grasp this codebase fast, open these exact files in this order:

1.  `app/main.py` — The bootstrapper: sets up FastAPI, CORS middlewares, and prefix routing.
2.  `app/api/api.py` — The routing tree aggregator.
3.  `app/api/deps.py` — Dependency injections for DB sessions (`SessionDatabase`/`SessionDatabaseRo`) and user auth.
4.  `app/api/routes/articles.py` — The endpoint declarations for articles.
5.  `app/schemas/articles.py` — The validation models mapping data shapes.
6.  `app/models/article.py` — The SQLAlchemy physical database ORM mapping.
7.  `app/crud/crud_article.py` — The Repository implementation containing SQL queries.
8.  `app/db/session.py` — Database connection configurations and dual-session setup.
9.  `pyproject.toml` — The project configuration sheet.
10. `tests/conftest.py` — The testing environment bootstrapper.

---

## 🧪 One Safe Change to Attempt

Let's fix a performance bottleneck. In [app/crud/crud_article.py:94](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/crud/crud_article.py#L94), tag mapping is performed sequentially:

```python
for tag in obj_in.tag_list:
    db_obj.tags.append(await self.db.scalar(select(Tag).filter_by(name=tag)) or Tag(name=tag))
```
This performs a separate database query for **every single tag** (an N+1 query pattern during inserts).
We can optimize this by retrieving all existing tags in a single batch query, mapping them in-memory, and only inserting new tags.

*   **Drill:** Optimize this flow in [app/crud/crud_article.py](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/crud/crud_article.py) by querying all tags in `tag_list` once: `select(Tag).filter(Tag.name.in_(obj_in.tag_list))`.

---

## 💬 Teach-Back Exercise

To ensure complete integration of these concepts, explain this out loud to yourself or a colleague:
> "In Node/Express, we pass request objects through a chain of middleware functions (`req, res, next`) to attach authenticated users. In FastAPI, we use **Dependency Injection** via `Depends()`. We define a type alias like `CurrentUser = Annotated[User, Depends(_get_current_user)]` in our route signatures. FastAPI resolves this at runtime by finding the header, verifying the signature using our security library, querying the database repository, and delivering the fully-typed `User` object directly to our router function. If validation or auth fails, FastAPI aborts early and returns a standardized JSON response."

---

## 🛑 What This Fast Track Skips

To keep this a "weekend win," this module purposely skips:
1.  Writing complex Alembic database migrations.
2.  Deploying dockerized multi-container setups (`compose.yaml`).
3.  Solving high-concurrency database connection pooling.
4.  Configuring deep typechecking configurations (`mypy.ini` rules).
These are detailed systematically in the upcoming core chapters.
