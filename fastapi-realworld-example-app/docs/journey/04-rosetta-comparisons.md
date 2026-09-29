# Developer Onboarding Journey: Rosetta Stone Syntax Comparisons

This module is designed for logical and comparative learners. We place Python FastAPI code blocks side-by-side with our rewritten TypeScript, Express, and Prisma equivalents to map functional translations cleanly.

---

## 🛣️ 1. Route Controllers & Handlers

### 🐍 The Python FastAPI Approach
```python
# app/api/routes/articles.py
@router.post(
    "",
    response_model=SingleArticleResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_article(
    article_in: NewArticle,
    current_user: CurrentUser,
    articles: ArticlesRepository = Depends(get_articles_service),
) -> SingleArticleResponse:
    # Handler logic here...
```

### 🟦 The TypeScript Express Equivalent
```typescript
// src/routes/articles.ts
import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { NewArticleSchema } from '../schemas/articles';
import { ArticleRepository } from '../repositories/ArticleRepository';

const router = Router();

router.post(
  '/',
  authenticate,
  validate(NewArticleSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    const authorId = req.user.id;
    const newArticle = await ArticleRepository.create(req.body.article, authorId);
    res.status(201).json({ article: newArticle });
  }
);
```

---

## 🗄️ 2. Database Models & Schema Declarations

### 🐍 The Python SQLAlchemy Definition
```python
# app/models/article.py
class Article(Base):
    __tablename__ = "articles"

    id: Mapped[int] = mapped_column(primary_key=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String, nullable=False)
    slug: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    
    author: Mapped["User"] = relationship("User", back_populates="articles")
    tags: Mapped[list["Tag"]] = relationship(
        "Tag", secondary=article_tag, back_populates="articles"
    )
```

### 🟦 The TypeScript Prisma Definition
```prisma
// prisma/schema.prisma
model Article {
  id          Int       @id @default(autoincrement())
  authorId    Int
  title       String
  slug        String    @unique
  body        String
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  author      User      @relation(fields: [authorId], references: [id], onDelete: Cascade)
  tags        Tag[]     @relation("ArticleTags")
}
```

---

## 📦 3. Relational Database Eager Loading

### 🐍 The Python SQLAlchemy joinedload Query
```python
# app/crud/crud_article.py
query = (
    select(Article)
    .options(
        joinedload(Article.author).joinedload(User.followers),
        joinedload(Article.tags),
    )
    .filter(Article.slug == slug)
)
result = await self.dbro.scalar(query)
```

### 🟦 The TypeScript Prisma Include Query
```typescript
// src/repositories/ArticleRepository.ts
const article = await prisma.article.findUnique({
  where: { slug },
  include: {
    author: {
      include: {
        followers: true,
      },
    },
    tags: true,
  },
});
```

---

## 🛡️ 4. Validation Schemas & Parameter Auditing

### 🐍 The Python Pydantic Schema
```python
# app/schemas/articles.py
class NewArticle(BaseModel):
    title: str = Field(..., min_length=1)
    description: str
    body: str
    tag_list: list[str] = Field(default_factory=list, alias="tagList")
```

### 🟦 The TypeScript Zod Schema
```typescript
// src/schemas/articles.ts
import { z } from 'zod';

export const NewArticleSchema = z.object({
  body: z.object({
    article: z.object({
      title: z.string().min(1),
      description: z.string(),
      body: z.string(),
      tagList: z.array(z.string()).default([]),
    }),
  }),
});
```
