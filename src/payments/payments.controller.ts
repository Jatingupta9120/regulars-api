import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VerifiedGuard } from '../common/verified.guard';
import { CurrentUser, type MemberPrincipal } from '../common/current-user.decorator';
import { PaymentsService } from './payments.service';
import { PaymentWebhookDto } from './payments.dto';

@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('cohorts/:id/checkout')
  @UseGuards(JwtAuthGuard, VerifiedGuard)
  @HttpCode(201)
  async checkout(
    @CurrentUser() user: MemberPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ url: string }> {
    return this.payments.checkout(user.userId, id);
  }

  @Post('payments/webhook')
  @HttpCode(200)
  async webhook(
    @Headers('stripe-signature') signature: string | undefined,
    @Body() dto: PaymentWebhookDto,
  ): Promise<{ ok: true }> {
    return this.payments.handleWebhook(signature, dto);
  }
}
