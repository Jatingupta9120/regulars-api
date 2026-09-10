import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * One charge, for one cohort. There is no subscription anywhere in this
   * service and no stored card, because a subscription whose value ends when it
   * works will always be tempted to stall.
   */
  async checkout(userId: string, cohortId: string): Promise<{ url: string }> {
    const membership = await this.prisma.cohortMember.findUnique({
      where: { cohortId_userId: { cohortId, userId } },
      include: { cohort: true },
    });

    if (!membership) throw new NotFoundException('You were not offered that cohort.');
    if (membership.status === 'REMOVED') throw new BadRequestException('That offer is closed.');
    if (membership.paidAt) throw new BadRequestException('You have already paid for this cohort.');
    if (membership.cohort.status === 'CANCELLED') {
      throw new BadRequestException('That cohort was cancelled. Nobody was charged.');
    }

    const checkoutRef = `cs_${cohortId.slice(0, 8)}_${userId.slice(0, 8)}`;
    await this.prisma.cohortMember.update({
      where: { id: membership.id },
      data: { checkoutRef },
    });

    // TODO: create a real Stripe Checkout session in one-time payment mode.
    // mode: 'payment' — never 'subscription'.
    const base = process.env.STRIPE_CHECKOUT_URL ?? 'https://checkout.example/pay';
    return { url: `${base}?ref=${checkoutRef}&amount=${membership.cohort.priceCents}` };
  }

  async handleWebhook(
    signature: string | undefined,
    body: { checkoutRef: string; paid: boolean },
  ): Promise<{ ok: true }> {
    this.assertSignature(signature);

    const membership = await this.prisma.cohortMember.findFirst({
      where: { checkoutRef: body.checkoutRef },
      include: { cohort: { include: { members: { include: { user: true } } } } },
    });
    if (!membership) throw new BadRequestException('Unknown checkout reference.');
    if (membership.paidAt) return { ok: true }; // Stripe retries; stay idempotent.
    if (!body.paid) return { ok: true };

    await this.prisma.cohortMember.update({
      where: { id: membership.id },
      data: { status: 'PAID', paidAt: new Date() },
    });

    await this.maybeConfirm(membership.cohortId);
    return { ok: true };
  }

  /**
   * A cohort confirms only when the promise made before payment actually holds:
   * the full six, and at least as many women as we said there would be. If the
   * promise cannot be kept we cancel and refund rather than quietly substitute,
   * because "we said four women and delivered two" is the complaint that ends
   * this business.
   */
  private async maybeConfirm(cohortId: string): Promise<void> {
    const cohort = await this.prisma.cohort.findUnique({
      where: { id: cohortId },
      include: { members: { include: { user: true } }, sessions: true },
    });
    if (!cohort || cohort.status !== 'FORMING') return;

    const paid = cohort.members.filter((m) => m.status === 'PAID');
    if (paid.length < cohort.promisedSize) return;

    const women = paid.filter((m) => m.user.gender === 'WOMAN').length;
    if (women < cohort.promisedWomen) {
      this.logger.warn(
        `Cohort ${cohortId} filled but composition promise failed: ${women} of ${cohort.promisedWomen} women.`,
      );
      return; // An operator decides: hold for a better match, or cancel and refund.
    }

    await this.prisma.cohort.update({
      where: { id: cohortId },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
    });

    const first = cohort.sessions.find((s) => s.weekNumber === 1);
    if (!first) return;

    // One of the eight notifications a member gets across a whole cohort.
    await Promise.all(
      paid.map((m) =>
        this.notifications.send(m.userId, first.id, 'cohort_confirmed', {
          title: 'Your cohort is confirmed',
          body: `Six of you, ${cohort.neighborhood}. First session is week one.`,
        }),
      ),
    );
  }

  private assertSignature(signature: string | undefined): void {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new UnauthorizedException('Webhook secret is not configured.');
    if (!signature) throw new UnauthorizedException('Missing signature.');

    const given = createHash('sha256').update(signature).digest();
    const expected = createHash('sha256').update(secret).digest();
    if (!timingSafeEqual(given, expected)) throw new UnauthorizedException('Bad signature.');
  }
}
