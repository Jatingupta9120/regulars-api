import { Body, Controller, Delete, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type MemberPrincipal } from '../common/current-user.decorator';
import { UsersService, type MeResponse } from './users.service';
import { UpdateProfileDto } from './users.dto';

@Controller('me')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async me(@CurrentUser() user: MemberPrincipal): Promise<MeResponse> {
    return this.users.me(user.userId);
  }

  @Patch()
  async update(
    @CurrentUser() user: MemberPrincipal,
    @Body() dto: UpdateProfileDto,
  ): Promise<MeResponse> {
    return this.users.updateProfile(user.userId, dto);
  }

  @Delete()
  async remove(@CurrentUser() user: MemberPrincipal): Promise<{ deleted: true }> {
    return this.users.deleteAccount(user.userId);
  }
}
