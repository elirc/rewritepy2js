# Codebase Contribution Practice

This module provides hands-on contribution drills. You are given three distinct assignments designed to mirror actual enterprise engineering Jira tickets, targeting real locations in this codebase.

---

## 🎟️ Ticket 1: Implement Soft-Delete on Articles

### Business Requirement
Enterprise compliance rules require that when an article is deleted, it must not be purged from the physical database table. Instead, it must be hidden from normal feed queries ("soft-deleted") so audit history is preserved.

### Target Files
1.  [app/models/article.py](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/models/article.py) (relational mapping).
2.  [app/crud/crud_article.py](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/crud/crud_article.py) (persistence layer).

### Constraints
*   Add a `deleted_at` nullable DateTime column to the `Article` model.
*   When a user calls `DELETE /api/articles/{slug}`, set `deleted_at` to the current UTC timestamp instead of executing SQL `DELETE`.
*   All public listings (`GET /api/articles` and `GET /api/articles/feed`) must filter out soft-deleted articles: `.filter(Article.deleted_at.is_(None))`.

### 5-Step Implementation Plan
1.  **Step 1:** Modify [app/models/article.py](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/models/article.py), importing `datetime` and adding `deleted_at: Mapped[datetime | None] = mapped_column(DateTime, default=None, nullable=True)`.
2.  **Step 2:** Generate and run a database migration script:
    ```powershell
    # [INFERRED]
    alembic revision --autogenerate -m "add soft delete to articles"
    alembic upgrade head
    ```
3.  **Step 3:** Open [app/crud/crud_article.py](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/crud/crud_article.py). Modify `delete()` method: instead of `await self.db.delete(db_obj)`, set `db_obj.deleted_at = datetime.utcnow()`, add it back to the session, and commit.
4.  **Step 4:** Refactor `get_list(...)` and `get_feed(...)` query selectors, appending `.filter(Article.deleted_at.is_(None))`.
5.  **Step 5:** Run tests and verify no existing tests break.

### Testing Blueprint
*   **Target File:** `tests/api/articles/test_article_delete.py`.
*   **Fixture setup:** Add an article record to the test database.
*   **Mock context:** Send a `DELETE` request acting as the author.
*   **Assertions:**
    *   Verify response returns status code `200 OK` or `204 No Content`.
    *   Query the database directly using a raw SELECT query: assert that the article row still exists but has `deleted_at` populated.
    *   Attempt to fetch global articles feed: assert that the soft-deleted article does **not** appear in the response payload.

### Self-Grade Rubric
*   **Basic:** You modified `delete()` to save `deleted_at` but forgot to filter listings.
*   **Solid:** You modified models, migrations, and listings queries correctly.
*   **Strong:** You handled relationship cascades securely, ensuring nested tags or comments remain intact but hidden under soft-delete restrictions.

---

## 🎟️ Ticket 2: Optimize Tag Insertion (N+1 Query Bottleneck)

### Business Requirement
During article creation, the system runs a sequential select query for every single tag in the request payload to see if it already exists in the database. Refactor this block to run a single batch check.

### Target Files
1.  [app/crud/crud_article.py](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/crud/crud_article.py) (specifically the `create` method).

### Constraints
*   Execute exactly **one** database SELECT query to find existing tags: `select(Tag).filter(Tag.name.in_(obj_in.tag_list))`.
*   Determine which tags are missing in-memory by computing the differences, then insert only the missing tag records.

### 5-Step Implementation Plan
1.  **Step 1:** Open [app/crud/crud_article.py](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/crud/crud_article.py) and locate `create()` around line 94.
2.  **Step 2:** Query all existing tags matching `tag_list` once: `existing_tags = (await self.db.scalars(select(Tag).filter(Tag.name.in_(obj_in.tag_list)))).all()`.
3.  **Step 3:** Form a dictionary lookup of existing tags: `tag_map = {tag.name: tag for tag in existing_tags}`.
4.  **Step 4:** Iterate over `obj_in.tag_list`. If a tag is not in `tag_map`, instantiate `new_tag = Tag(name=tag)` and append it; otherwise, append `tag_map[tag]`.
5.  **Step 5:** Save the article model, commit, and verify correctness by running creation tests.

### Testing Blueprint
*   **Target File:** `tests/api/articles/test_article_create.py`.
*   **Verification:** Run the tests using `pytest -s` to print standard database statements.
*   **Assertions:** Assert that creating an article with 5 tags triggers a single SQL SELECT query on tags, rather than 5 sequential queries.

---

## 🎟️ Ticket 3: Prevent Self-Favoriting (Business Constraint Rule)

### Business Requirement
To prevent artificial rating manipulation, authors are strictly forbidden from favoriting their own articles.

### Target Files
1.  [app/api/routes/favorites.py](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/api/routes/favorites.py) (favorites router endpoint).

### Constraints
*   If an authenticated user attempts to favorite an article they wrote, intercept the transaction immediately and return `400 Bad Request`.

### 5-Step Implementation Plan
1.  **Step 1:** Open [app/api/routes/favorites.py](file:///c:/Users/Owner/Desktop/rewritepy2js/fastapi-realworld-example-app/app/api/routes/favorites.py) and locate the `favorite` endpoint around line 17.
2.  **Step 2:** Retrieve the article instance using the slug parameter: `article = await articles.get_by_slug(slug=slug)`.
3.  **Step 3:** Add an ownership check: `if article.author_id == current_user.id:`.
4.  **Step 4:** Inside the block, raise `HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot favorite your own article")`.
5.  **Step 5:** Execute the favorites test suite.

### Testing Blueprint
*   **Target File:** `tests/api/articles/test_article_favorite.py`.
*   **Fixture setup:** Log in acting as John. Generate and insert an article written by John.
*   **Mock context:** Send a `POST` request to `/api/articles/johns-article-slug/favorite`.
*   **Assertions:** Assert that the response returns status code `400 Bad Request` containing the designated error detail message.
