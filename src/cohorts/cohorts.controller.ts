import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VerifiedGuard } from '../common/verified.guard';
import { CurrentUser, type MemberPrincipal } from '../common/current-user.decorator';
import { CohortsService, type CohortView } from './cohorts.service';

@Controller('cohorts')
@UseGuards(JwtAuthGuard, VerifiedGuard)
export class CohortsController {
  constructor(private readonly cohorts: CohortsService) {}

  @Get('mine')
  async mine(@CurrentUser() user: MemberPrincipal): Promise<CohortView | null> {
    return this.cohorts.mine(user.userId);
  }

  @Get(':id')
  async byId(
    @CurrentUser() user: MemberPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CohortView> {
    return this.cohorts.byId(user.userId, id);
  }
}
