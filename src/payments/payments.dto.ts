import { IsBoolean, IsString, MaxLength } from 'class-validator';

export class PaymentWebhookDto {
  @IsString()
  @MaxLength(200)
  checkoutRef!: string;

  @IsBoolean()
  paid!: boolean;
}
