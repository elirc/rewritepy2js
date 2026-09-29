-- CreateTable
CREATE TABLE "users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "bio" TEXT,
    "image" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "articles" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "author_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "articles_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tags" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "comments" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "article_id" INTEGER NOT NULL,
    "author_id" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "comments_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_UserFollows" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_UserFollows_A_fkey" FOREIGN KEY ("A") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_UserFollows_B_fkey" FOREIGN KEY ("B") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_UserFavorites" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_UserFavorites_A_fkey" FOREIGN KEY ("A") REFERENCES "articles" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_UserFavorites_B_fkey" FOREIGN KEY ("B") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_ArticleTags" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_ArticleTags_A_fkey" FOREIGN KEY ("A") REFERENCES "articles" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ArticleTags_B_fkey" FOREIGN KEY ("B") REFERENCES "tags" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "articles_slug_key" ON "articles"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "_UserFollows_AB_unique" ON "_UserFollows"("A", "B");

-- CreateIndex
CREATE INDEX "_UserFollows_B_index" ON "_UserFollows"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_UserFavorites_AB_unique" ON "_UserFavorites"("A", "B");

-- CreateIndex
CREATE INDEX "_UserFavorites_B_index" ON "_UserFavorites"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_ArticleTags_AB_unique" ON "_ArticleTags"("A", "B");

-- CreateIndex
CREATE INDEX "_ArticleTags_B_index" ON "_ArticleTags"("B");
