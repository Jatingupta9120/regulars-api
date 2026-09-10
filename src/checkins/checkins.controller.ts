import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type MemberPrincipal } from '../common/current-user.decorator';
import { CheckInsService } from './checkins.service';
import { CreateCheckInDto } from './checkins.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class CheckInsController {
  constructor(private readonly checkIns: CheckInsService) {}

  @Post('sessions/:sessionId/check-in')
  @HttpCode(201)
  async submit(
    @CurrentUser() user: MemberPrincipal,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: CreateCheckInDto,
  ): Promise<{ ok: true }> {
    return this.checkIns.submit(user.userId, sessionId, dto);
  }

  @Get('check-ins/outstanding')
  async outstanding(
    @CurrentUser() user: MemberPrincipal,
  ): Promise<Array<{ sessionId: string; weekNumber: number }>> {
    return this.checkIns.outstanding(user.userId);
  }
}
