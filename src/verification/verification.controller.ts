import { Body, Controller, Headers, HttpCode, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type MemberPrincipal } from '../common/current-user.decorator';
import { VerificationService, type StartResponse } from './verification.service';
import { VerificationWebhookDto } from './verification.dto';

@Controller('verification')
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Post('start')
  @UseGuards(JwtAuthGuard)
  @HttpCode(201)
  async start(@CurrentUser() user: MemberPrincipal): Promise<StartResponse> {
    return this.verification.start(user.userId);
  }

  /** Provider callback. Authenticated by shared secret, not by a member token. */
  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Headers('x-verification-signature') signature: string | undefined,
    @Body() dto: VerificationWebhookDto,
  ): Promise<{ ok: true }> {
    return this.verification.handleWebhook(signature, dto);
  }
}
