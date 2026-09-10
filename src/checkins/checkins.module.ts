import { Module } from '@nestjs/common';
import { SafetyModule } from '../safety/safety.module';
import { CheckInsController } from './checkins.controller';
import { CheckInsService } from './checkins.service';

@Module({
  imports: [SafetyModule],
  controllers: [CheckInsController],
  providers: [CheckInsService],
})
export class CheckInsModule {}
