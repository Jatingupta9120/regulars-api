import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class VerificationWebhookDto {
  @IsString()
  @MaxLength(200)
  referenceId!: string;

  @IsIn(['APPROVED', 'FAILED'])
  status!: 'APPROVED' | 'FAILED';

  @IsString()
  @IsOptional()
  @MaxLength(200)
  identityHash?: string;

  @IsString()
  @IsOptional()
  @MaxLength(60)
  documentType?: string;

  @IsString()
  @IsOptional()
  @MaxLength(60)
  failureCode?: string;
}
