import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SafetyService } from '../safety/safety.service';
import type { CreateCheckInDto } from './checkins.dto';

@Injectable()
export class CheckInsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly safety: SafetyService,
  ) {}

  /**
   * One check-in per member per session, written once and never updated. There
   * is deliberately no read endpoint for anyone but the author, and no update
   * or delete path anywhere in this service.
   */
  async submit(userId: string, sessionId: string, dto: CreateCheckInDto): Promise<{ ok: true }> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { cohort: { include: { members: true } } },
    });
    if (!session) throw new NotFoundException('That session does not exist.');

    const membership = session.cohort.members.find((m) => m.userId === userId);
    if (!membership) throw new ForbiddenException('You were not in that session.');

    const existing = await this.prisma.checkIn.findUnique({
      where: { sessionId_authorId: { sessionId, authorId: userId } },
    });
    if (existing) throw new BadRequestException('You already checked in for this session.');

    if (dto.report && dto.report.subjectId === userId) {
      throw new BadRequestException('You cannot report yourself.');
    }
    if (dto.report && !session.cohort.members.some((m) => m.userId === dto.report?.subjectId)) {
      throw new BadRequestException('That person was not in your cohort.');
    }

    const checkIn = await this.prisma.checkIn.create({
      data: {
        sessionId,
        authorId: userId,
        enjoyed: dto.enjoyed,
        wouldReturn: dto.wouldReturn,
        feltSafe: dto.feltSafe,
        romanticPressure: dto.romanticPressure ?? false,
        note: dto.note ?? null,
      },
    });

    if (dto.report) {
      await this.safety.raise({
        reporterId: userId,
        subjectId: dto.report.subjectId,
        severity: dto.report.severe ? 'SEVERE' : 'CONCERN',
        reason: dto.report.reason,
        checkInId: checkIn.id,
      });
    }

    // Returns nothing about the outcome. The reporter is never told whether
    // someone else has also flagged this person.
    return { ok: true };
  }

  /** Which of my sessions still need a check-in. Used to badge nothing at all. */
  async outstanding(userId: string): Promise<Array<{ sessionId: string; weekNumber: number }>> {
    const sessions = await this.prisma.session.findMany({
      where: {
        startsAt: { lt: new Date() },
        cohort: { members: { some: { userId, status: { in: ['PAID', 'ACTIVE'] } } } },
        checkIns: { none: { authorId: userId } },
      },
      select: { id: true, weekNumber: true },
      orderBy: { startsAt: 'asc' },
    });
    return sessions.map((s) => ({ sessionId: s.id, weekNumber: s.weekNumber }));
  }
}
