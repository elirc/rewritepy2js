import { prisma } from './prisma';

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export interface ArticleResponse {
  slug: string;
  title: string;
  description: string;
  body: string;
  tagList: string[];
  createdAt: Date;
  updatedAt: Date;
  favorited: boolean;
  favoritesCount: number;
  author: {
    username: string;
    bio: string | null;
    image: string | null;
    following: boolean;
  };
}

export class ArticleRepository {
  private static mapArticle(article: any, currentUserId?: number): ArticleResponse {
    const isFavorited = currentUserId
      ? article.favoritedBy.some((u: any) => u.id === currentUserId)
      : false;

    const isFollowing = currentUserId
      ? article.author.followers.some((f: any) => f.id === currentUserId)
      : false;

    return {
      slug: article.slug,
      title: article.title,
      description: article.description,
      body: article.body,
      tagList: article.tags.map((t: any) => t.name),
      createdAt: article.createdAt,
      updatedAt: article.updatedAt,
      favorited: isFavorited,
      favoritesCount: article.favoritedBy.length,
      author: {
        username: article.author.username,
        bio: article.author.bio,
        image: article.author.image,
        following: isFollowing,
      },
    };
  }

  static async create(data: any, authorId: number): Promise<ArticleResponse> {
    const slug = slugify(data.title) + '-' + ((Math.random() * 36e5) | 0).toString(36);

    // Eagerly connect tags
    const tagConnections = data.tagList
      ? data.tagList.map((name: string) => ({
          where: { name },
          create: { name },
        }))
      : [];

    const article = await prisma.article.create({
      data: {
        title: data.title,
        description: data.description,
        body: data.body,
        slug,
        authorId,
        tags: {
          connectOrCreate: tagConnections,
        },
      },
      include: {
        author: {
          include: { followers: true },
        },
        tags: true,
        favoritedBy: true,
      },
    });

    return this.mapArticle(article, authorId);
  }

  static async getBySlug(slug: string, currentUserId?: number): Promise<ArticleResponse | null> {
    const article = await prisma.article.findUnique({
      where: { slug },
      include: {
        author: {
          include: { followers: true },
        },
        tags: true,
        favoritedBy: true,
      },
    });

    if (!article) return null;
    return this.mapArticle(article, currentUserId);
  }

  static async update(slug: string, data: any, currentUserId: number): Promise<ArticleResponse | null> {
    const existing = await prisma.article.findUnique({ where: { slug } });
    if (!existing) return null;

    if (existing.authorId !== currentUserId) {
      throw new Error('Forbidden');
    }

    const updateData: any = {};
    if (data.title) {
      updateData.title = data.title;
      updateData.slug = slugify(data.title) + '-' + ((Math.random() * 36e5) | 0).toString(36);
    }
    if (data.description) updateData.description = data.description;
    if (data.body) updateData.body = data.body;

    const article = await prisma.article.update({
      where: { slug },
      data: updateData,
      include: {
        author: {
          include: { followers: true },
        },
        tags: true,
        favoritedBy: true,
      },
    });

    return this.mapArticle(article, currentUserId);
  }

  static async delete(slug: string, currentUserId: number): Promise<boolean> {
    const existing = await prisma.article.findUnique({ where: { slug } });
    if (!existing) return false;

    if (existing.authorId !== currentUserId) {
      throw new Error('Forbidden');
    }

    await prisma.article.delete({ where: { slug } });
    return true;
  }

  static async list(query: any, currentUserId?: number): Promise<{ articles: ArticleResponse[]; articlesCount: number }> {
    const limit = parseInt(query.limit) || 20;
    const offset = parseInt(query.offset) || 0;

    const where: any = {};

    if (query.tag) {
      where.tags = {
        some: { name: query.tag },
      };
    }

    if (query.author) {
      where.author = { username: query.author };
    }

    if (query.favorited) {
      where.favoritedBy = {
        some: { username: query.favorited },
      };
    }

    const [articles, count] = await Promise.all([
      prisma.article.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
        include: {
          author: {
            include: { followers: true },
          },
          tags: true,
          favoritedBy: true,
        },
      }),
      prisma.article.count({ where }),
    ]);

    return {
      articles: articles.map((a) => this.mapArticle(a, currentUserId)),
      articlesCount: count,
    };
  }

  static async feed(query: any, currentUserId: number): Promise<{ articles: ArticleResponse[]; articlesCount: number }> {
    const limit = parseInt(query.limit) || 20;
    const offset = parseInt(query.offset) || 0;

    const where = {
      author: {
        followers: {
          some: { id: currentUserId },
        },
      },
    };

    const [articles, count] = await Promise.all([
      prisma.article.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
        include: {
          author: {
            include: { followers: true },
          },
          tags: true,
          favoritedBy: true,
        },
      }),
      prisma.article.count({ where }),
    ]);

    return {
      articles: articles.map((a) => this.mapArticle(a, currentUserId)),
      articlesCount: count,
    };
  }

  static async favorite(slug: string, currentUserId: number): Promise<ArticleResponse | null> {
    const article = await prisma.article.findUnique({ where: { slug } });
    if (!article) return null;

    const updated = await prisma.article.update({
      where: { slug },
      data: {
        favoritedBy: {
          connect: { id: currentUserId },
        },
      },
      include: {
        author: {
          include: { followers: true },
        },
        tags: true,
        favoritedBy: true,
      },
    });

    return this.mapArticle(updated, currentUserId);
  }

  static async unfavorite(slug: string, currentUserId: number): Promise<ArticleResponse | null> {
    const article = await prisma.article.findUnique({ where: { slug } });
    if (!article) return null;

    const updated = await prisma.article.update({
      where: { slug },
      data: {
        favoritedBy: {
          disconnect: { id: currentUserId },
        },
      },
      include: {
        author: {
          include: { followers: true },
        },
        tags: true,
        favoritedBy: true,
      },
    });

    return this.mapArticle(updated, currentUserId);
  }

  static async getTags(): Promise<string[]> {
    const tags = await prisma.tag.findMany({
      select: { name: true },
    });
    return tags.map((t) => t.name);
  }
}
