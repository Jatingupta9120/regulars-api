import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReportDto {
  @IsUUID()
  subjectId!: string;

  @IsBoolean()
  severe!: boolean;

  @IsString()
  @MaxLength(2000)
  reason!: string;
}

export class CreateCheckInDto {
  @IsInt()
  @Min(1)
  @Max(5)
  enjoyed!: number;

  @IsBoolean()
  wouldReturn!: boolean;

  @IsBoolean()
  feltSafe!: boolean;

  @IsBoolean()
  @IsOptional()
  romanticPressure?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(5000)
  note?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ReportDto)
  report?: ReportDto;
}
