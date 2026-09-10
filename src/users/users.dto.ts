import { Gender } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateProfileDto {
  @IsString() @IsOptional() @MaxLength(80)
  displayName?: string;

  @IsEnum(Gender) @IsOptional()
  gender?: Gender;

  @IsString() @IsOptional() @MaxLength(20)
  ageBand?: string;

  @IsString() @IsOptional() @MaxLength(60)
  neighborhood?: string;

  @IsString() @IsOptional() @MaxLength(200)
  pushToken?: string;

  @IsInt() @IsOptional() @Min(0) @Max(23)
  reminderHour?: number;
}
