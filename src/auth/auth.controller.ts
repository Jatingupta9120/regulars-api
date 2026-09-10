import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RequestCodeDto, VerifyCodeDto } from './auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('code')
  @HttpCode(202)
  async requestCode(@Body() dto: RequestCodeDto): Promise<{ sent: true }> {
    await this.auth.requestCode(dto.email);
    return { sent: true };
  }

  @Post('token')
  @HttpCode(200)
  async verify(@Body() dto: VerifyCodeDto): Promise<{ accessToken: string }> {
    return this.auth.verifyCode(dto.email, dto.code);
  }
}
