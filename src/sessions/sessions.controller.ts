import { Body, Controller, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { AttendanceState } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VerifiedGuard } from '../common/verified.guard';
import { CurrentUser, type MemberPrincipal } from '../common/current-user.decorator';
import { SessionsService } from './sessions.service';
import { SetAttendanceDto } from './sessions.dto';

@Controller('sessions')
@UseGuards(JwtAuthGuard, VerifiedGuard)
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Put(':id/attendance')
  async setAttendance(
    @CurrentUser() user: MemberPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetAttendanceDto,
  ): Promise<{ state: AttendanceState }> {
    return this.sessions.setAttendance(user.userId, id, dto.state, dto.note);
  }
}
