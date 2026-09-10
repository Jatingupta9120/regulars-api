import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AttendanceState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * "Running late" and "I cannot make it", without composing a message. Bailing
   * honestly has to cost less than ghosting, or people ghost.
   */
  async setAttendance(
    userId: string,
    sessionId: string,
    state: AttendanceState,
    note?: string,
  ): Promise<{ state: AttendanceState }> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { cohort: { include: { members: true } } },
    });
    if (!session) throw new NotFoundException('That session does not exist.');

    const membership = session.cohort.members.find((m) => m.userId === userId);
    if (!membership || membership.status === 'REMOVED') {
      throw new ForbiddenException('You are not in that session.');
    }

    const record = await this.prisma.attendance.upsert({
      where: { sessionId_userId: { sessionId, userId } },
      update: { state, note: note ?? null, noticeAt: new Date() },
      create: { sessionId, userId, state, note: note ?? null, noticeAt: new Date() },
    });

    return { state: record.state };
  }
}
