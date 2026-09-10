import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { MemberPrincipal } from './current-user.decorator';

/**
 * Nothing that puts a member in a room with other people is reachable before
 * identity verification. Applied on top of the JWT guard, never instead of it.
 */
@Injectable()
export class VerifiedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<{ user?: MemberPrincipal }>().user;
    if (!user?.verified) {
      throw new ForbiddenException('Verify your identity before joining a cohort.');
    }
    return true;
  }
}
