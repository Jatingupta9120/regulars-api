import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private hash(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  /**
   * Emails a six-digit code. Always reports success, so the endpoint cannot be
   * used to discover which addresses have accounts.
   */
  async requestCode(email: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    const user = await this.prisma.user.upsert({
      where: { email: normalized },
      update: {},
      create: { email: normalized },
    });

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');

    await this.prisma.loginCode.create({
      data: {
        userId: user.id,
        codeHash: this.hash(code),
        expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
      },
    });

    // TODO: replace with Resend or Postmark. Both have free tiers that cover a
    // student project comfortably.
    this.logger.log(`Login code for ${normalized}: ${code}`);
  }

  async verifyCode(email: string, code: string): Promise<{ accessToken: string }> {
    const normalized = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (!user) throw new UnauthorizedException('That code is not valid.');
    if (user.suspendedAt) {
      throw new UnauthorizedException('This account is suspended. Write to safety@regulars.nyc.');
    }

    const record = await this.prisma.loginCode.findFirst({
      where: { userId: user.id, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) throw new UnauthorizedException('That code has expired. Ask for a new one.');
    if (record.attempts >= MAX_ATTEMPTS) {
      throw new BadRequestException('Too many attempts. Ask for a new code.');
    }

    const given = Buffer.from(this.hash(code));
    const expected = Buffer.from(record.codeHash);
    const matches = given.length === expected.length && timingSafeEqual(given, expected);

    if (!matches) {
      await this.prisma.loginCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('That code is not valid.');
    }

    await this.prisma.loginCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });

    return { accessToken: await this.jwt.signAsync({ sub: user.id }) };
  }
}
