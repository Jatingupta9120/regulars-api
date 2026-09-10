import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface MemberPrincipal {
  readonly userId: string;
  readonly email: string;
  readonly verified: boolean;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): MemberPrincipal =>
    ctx.switchToHttp().getRequest<{ user: MemberPrincipal }>().user,
);
