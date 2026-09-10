import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface StartResponse {
  /** Hosted flow the app opens. The document never touches our servers. */
  url: string;
  referenceId: string;
}

/**
 * Identity verification through a hosted third-party flow.
 *
 * We never receive, transmit or store the document image. What comes back is a
 * decision, a reference, and a hash that identifies the human behind it. That
 * hash is the anti-evasion key: two accounts sharing one are the same person,
 * so a removal survives someone signing up again with a new email address.
 */
@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async start(userId: string): Promise<StartResponse> {
    const existing = await this.prisma.verification.findUnique({ where: { userId } });
    if (existing?.status === 'APPROVED') {
      throw new BadRequestException('You are already verified.');
    }

    const provider = process.env.VERIFICATION_PROVIDER ?? 'stripe-identity';
    const referenceId = `inq_${userId.slice(0, 8)}_${Date.now()}`;

    await this.prisma.verification.upsert({
      where: { userId },
      update: { status: 'PENDING', provider, referenceId, failureCode: null, decidedAt: null },
      create: { userId, status: 'PENDING', provider, referenceId },
    });

    const base = process.env.VERIFICATION_HOSTED_URL ?? 'https://verify.example/start';
    return { url: `${base}?ref=${referenceId}`, referenceId };
  }

  /**
   * Called by the provider, not by the app. Authenticated with a shared secret
   * rather than a member token, because the caller is not a member.
   */
  async handleWebhook(
    signature: string | undefined,
    body: {
      referenceId: string;
      status: 'APPROVED' | 'FAILED';
      identityHash?: string;
      documentType?: string;
      failureCode?: string;
    },
  ): Promise<{ ok: true }> {
    this.assertSignature(signature);

    const record = await this.prisma.verification.findFirst({
      where: { referenceId: body.referenceId },
    });
    if (!record) throw new BadRequestException('Unknown reference.');

    // Someone already removed is trying again under a new account. Approve
    // nothing and suspend the new account immediately.
    if (body.status === 'APPROVED' && body.identityHash) {
      const priorSuspension = await this.prisma.verification.findFirst({
        where: {
          identityHash: body.identityHash,
          userId: { not: record.userId },
          user: { suspendedAt: { not: null } },
        },
      });

      if (priorSuspension) {
        await this.prisma.$transaction([
          this.prisma.user.update({
            where: { id: record.userId },
            data: { suspendedAt: new Date(), suspendedReason: 'evasion_of_removal' },
          }),
          this.prisma.verification.update({
            where: { userId: record.userId },
            data: {
              status: 'FAILED',
              failureCode: 'not_eligible',
              identityHash: body.identityHash,
              decidedAt: new Date(),
            },
          }),
        ]);
        this.logger.warn(`Blocked removal evasion for verification ${record.id}`);
        return { ok: true };
      }
    }

    await this.prisma.verification.update({
      where: { userId: record.userId },
      data: {
        status: body.status,
        identityHash: body.identityHash ?? record.identityHash,
        documentType: body.documentType ?? record.documentType,
        failureCode: body.status === 'FAILED' ? (body.failureCode ?? 'unreadable') : null,
        decidedAt: new Date(),
      },
    });

    return { ok: true };
  }

  private assertSignature(signature: string | undefined): void {
    const secret = process.env.VERIFICATION_WEBHOOK_SECRET;
    if (!secret) throw new UnauthorizedException('Webhook secret is not configured.');
    if (!signature) throw new UnauthorizedException('Missing signature.');

    const given = createHash('sha256').update(signature).digest();
    const expected = createHash('sha256').update(secret).digest();
    if (!timingSafeEqual(given, expected)) throw new UnauthorizedException('Bad signature.');
  }
}
