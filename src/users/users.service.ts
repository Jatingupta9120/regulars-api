import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateProfileDto } from './users.dto';

export interface MeResponse {
  id: string;
  email: string;
  displayName: string | null;
  neighborhood: string | null;
  ageBand: string | null;
  reminderHour: number;
  verification: { status: string; failureCode: string | null } | null;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async me(userId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { verification: true },
    });
    if (!user) throw new NotFoundException();

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      neighborhood: user.neighborhood,
      ageBand: user.ageBand,
      reminderHour: user.reminderHour,
      verification: user.verification
        ? { status: user.verification.status, failureCode: user.verification.failureCode }
        : null,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<MeResponse> {
    await this.prisma.user.update({ where: { id: userId }, data: dto });
    return this.me(userId);
  }

  /**
   * Account deletion, which both app stores require to be available in-app.
   * The safety record is deliberately kept: deleting it would let a removal be
   * undone by signing up again. The privacy policy says so in plain language.
   */
  async deleteAccount(userId: string): Promise<{ deleted: true }> {
    const verification = await this.prisma.verification.findUnique({ where: { userId } });

    await this.prisma.$transaction(async (tx) => {
      if (verification?.identityHash) {
        await tx.verification.update({
          where: { userId },
          data: { referenceId: 'deleted', documentType: null },
        });
      }
      await tx.user.update({
        where: { id: userId },
        data: {
          email: `deleted+${userId}@regulars.invalid`,
          displayName: null,
          pushToken: null,
          neighborhood: null,
        },
      });
    });

    return { deleted: true };
  }
}
