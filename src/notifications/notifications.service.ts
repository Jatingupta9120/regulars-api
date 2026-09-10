import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

export type ReminderKind = 'day_of' | 'cohort_confirmed' | 'group_change';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Notification policy, enforced in code rather than in a document.
 *
 * A member receives at most eight pushes across an entire four-week cohort:
 * four day-of reminders, one confirmation, and up to three group changes.
 * There is deliberately no re-engagement path, no "you have not opened the
 * app", and no promotional send. If you find yourself adding one, the product
 * has drifted.
 *
 * Every send writes a Reminder row first. That row is the idempotency key, so a
 * restart, a retry or an overlapping cron tick can never double-send.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async send(
    userId: string,
    sessionId: string,
    kind: ReminderKind,
    message: { title: string; body: string },
  ): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.pushToken || user.suspendedAt) return false;

    try {
      // Claim the send before making it. A unique violation means someone else
      // already sent this one.
      await this.prisma.reminder.create({ data: { userId, sessionId, kind } });
    } catch {
      return false;
    }

    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: user.pushToken,
          title: message.title,
          body: message.body,
          sound: null,
          priority: 'normal',
        }),
      });
      if (!response.ok) {
        this.logger.warn(`Push rejected for ${userId}: ${response.status}`);
      }
      return response.ok;
    } catch (cause) {
      this.logger.error(`Push failed for ${userId}`, cause as Error);
      return false;
    }
  }

  /**
   * Runs hourly and sends the day-of reminder to anyone whose chosen hour has
   * just arrived and whose session is today. Members who already cancelled are
   * skipped: reminding someone about an evening they have withdrawn from is the
   * kind of small carelessness that loses trust.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async sendDayOfReminders(): Promise<void> {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const sessions = await this.prisma.session.findMany({
      where: { startsAt: { gte: startOfDay, lt: endOfDay } },
      include: {
        cohort: { include: { members: { include: { user: true } } } },
        attendance: true,
      },
    });

    for (const session of sessions) {
      const time = session.startsAt.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'America/New_York',
      });

      for (const member of session.cohort.members) {
        if (member.status !== 'PAID' && member.status !== 'ACTIVE') continue;
        if (member.user.reminderHour !== now.getHours()) continue;

        const state = session.attendance.find((a) => a.userId === member.userId)?.state;
        if (state === 'CANCELLED') continue;

        await this.send(member.userId, session.id, 'day_of', {
          title: `${session.activity} tonight, ${time}`,
          body: `${session.venueName}. ${session.nearestSubway ?? ''}`.trim(),
        });
      }
    }
  }
}
