import { IsEmail, IsString, Length } from 'class-validator';

export class RequestCodeDto {
  @IsEmail({}, { message: 'That email address does not look complete.' })
  email!: string;
}

export class VerifyCodeDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(6, 6, { message: 'The code is six digits.' })
  code!: string;
}
