import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import type { MemberPrincipal } from '../common/current-user.decorator';

interface JwtPayload {
  sub: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'dev-only-secret-change-me',
    });
  }

  /**
   * Reads the user on every request rather than trusting claims in the token.
   * A suspension must take effect immediately, not when the token expires.
   */
  async validate(payload: JwtPayload): Promise<MemberPrincipal> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { verification: true },
    });

    if (!user) throw new UnauthorizedException();
    if (user.suspendedAt) {
      throw new UnauthorizedException('This account is suspended. Write to safety@regulars.nyc.');
    }

    return {
      userId: user.id,
      email: user.email,
      verified: user.verification?.status === 'APPROVED',
    };
  }
}
