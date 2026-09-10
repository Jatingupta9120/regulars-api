import { AttendanceState } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class SetAttendanceDto {
  @IsEnum(AttendanceState)
  state!: AttendanceState;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;
}
