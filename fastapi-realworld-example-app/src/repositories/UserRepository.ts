import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from './prisma';

const SECRET_KEY = process.env.SECRET_KEY || 'SECRET_KEY_FALLBACK';

export interface UserResponse {
  email: string;
  token: string;
  username: string;
  bio: string | null;
  image: string | null;
}

export interface ProfileResponse {
  username: string;
  bio: string | null;
  image: string | null;
  following: boolean;
}

export class UserRepository {
  static generateToken(userId: number): string {
    return jwt.sign({ sub: userId.toString() }, SECRET_KEY, { expiresIn: '7d' });
  }

  static async register(data: any): Promise<UserResponse> {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(data.password, salt);

    const user = await prisma.user.create({
      data: {
        username: data.username,
        email: data.email,
        password: hashedPassword,
        bio: data.bio || '',
        image: data.image || '',
      },
    });

    const token = this.generateToken(user.id);
    return {
      email: user.email,
      token,
      username: user.username,
      bio: user.bio,
      image: user.image,
    };
  }

  static async login(data: any): Promise<UserResponse | null> {
    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user) return null;

    const isMatch = await bcrypt.compare(data.password, user.password);
    if (!isMatch) return null;

    const token = this.generateToken(user.id);
    return {
      email: user.email,
      token,
      username: user.username,
      bio: user.bio,
      image: user.image,
    };
  }

  static async findById(id: number): Promise<any | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  static async update(id: number, data: any): Promise<UserResponse> {
    const updateData: any = {};
    if (data.email) updateData.email = data.email;
    if (data.username) updateData.username = data.username;
    if (data.bio !== undefined) updateData.bio = data.bio;
    if (data.image !== undefined) updateData.image = data.image;
    if (data.password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(data.password, salt);
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    const token = this.generateToken(user.id);
    return {
      email: user.email,
      token,
      username: user.username,
      bio: user.bio,
      image: user.image,
    };
  }

  static async getProfile(targetUsername: string, currentUserId?: number): Promise<ProfileResponse | null> {
    const targetUser = await prisma.user.findFirst({
      where: { username: targetUsername },
      include: {
        followers: true,
      },
    });

    if (!targetUser) return null;

    const isFollowing = currentUserId
      ? targetUser.followers.some((f) => f.id === currentUserId)
      : false;

    return {
      username: targetUser.username,
      bio: targetUser.bio,
      image: targetUser.image,
      following: isFollowing,
    };
  }

  static async follow(targetUsername: string, currentUserId: number): Promise<ProfileResponse | null> {
    const targetUser = await prisma.user.findFirst({
      where: { username: targetUsername },
    });

    if (!targetUser) return null;

    await prisma.user.update({
      where: { id: targetUser.id },
      data: {
        followers: {
          connect: { id: currentUserId },
        },
      },
    });

    return {
      username: targetUser.username,
      bio: targetUser.bio,
      image: targetUser.image,
      following: true,
    };
  }

  static async unfollow(targetUsername: string, currentUserId: number): Promise<ProfileResponse | null> {
    const targetUser = await prisma.user.findFirst({
      where: { username: targetUsername },
    });

    if (!targetUser) return null;

    await prisma.user.update({
      where: { id: targetUser.id },
      data: {
        followers: {
          disconnect: { id: currentUserId },
        },
      },
    });

    return {
      username: targetUser.username,
      bio: targetUser.bio,
      image: targetUser.image,
      following: false,
    };
  }
}
