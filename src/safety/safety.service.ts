import { Injectable, Logger } from '@nestjs/common';
import { FlagSeverity } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const CONCERN_THRESHOLD = 2;

@Injectable()
export class SafetyService {
  private readonly logger = new Logger(SafetyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records a flag and enforces the consequence immediately, before any human
   * looks at it. Failing closed is the whole point: a suspension that waits for
   * a review is not a safety policy, it is a promise.
   */
  async raise(input: {
    reporterId: string;
    subjectId: string;
    severity: FlagSeverity;
    reason: string;
    checkInId?: string;
  }): Promise<{ suspended: boolean }> {
    const flag = await this.prisma.flag.create({
      data: {
        reporterId: input.reporterId,
        subjectId: input.subjectId,
        severity: input.severity,
        reason: input.reason,
        checkInId: input.checkInId ?? null,
      },
    });

    const concerns = await this.prisma.flag.count({
      where: { subjectId: input.subjectId, severity: 'CONCERN' },
    });

    const shouldSuspend = input.severity === 'SEVERE' || concerns >= CONCERN_THRESHOLD;

    if (shouldSuspend) {
      await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: input.subjectId },
          data: {
            suspendedAt: new Date(),
            suspendedReason:
              input.severity === 'SEVERE' ? 'severe_report' : 'two_concern_reports',
          },
        }),
        // Pull them out of every future session in the same breath.
        this.prisma.cohortMember.updateMany({
          where: { userId: input.subjectId, status: { in: ['INVITED', 'PAID', 'ACTIVE'] } },
          data: { status: 'REMOVED', removedAt: new Date() },
        }),
      ]);
    }

    await this.page(flag.id, input.severity, shouldSuspend);
    return { suspended: shouldSuspend };
  }

  /**
   * Reaches a human through a channel that does not depend on this app being
   * up. A logged failure here is itself an incident.
   */
  private async page(flagId: string, severity: FlagSeverity, suspended: boolean): Promise<void> {
    const url = process.env.SAFETY_WEBHOOK_URL;
    const body = { flagId, severity, suspended, at: new Date().toISOString() };

    this.logger.warn(`SAFETY FLAG ${JSON.stringify(body)}`);
    if (!url) return;

    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (cause) {
      this.logger.error(`Failed to page on flag ${flagId}`, cause as Error);
    }
  }
}
