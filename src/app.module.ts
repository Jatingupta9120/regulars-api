import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CohortsModule } from './cohorts/cohorts.module';
import { SessionsModule } from './sessions/sessions.module';
import { CheckInsModule } from './checkins/checkins.module';
import { SafetyModule } from './safety/safety.module';
import { VerificationModule } from './verification/verification.module';
import { PaymentsModule } from './payments/payments.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // Login codes are the obvious brute-force target. 60 requests a minute per
    // IP is generous for a real member and useless for an attacker.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    CohortsModule,
    SessionsModule,
    CheckInsModule,
    SafetyModule,
    VerificationModule,
    PaymentsModule,
    NotificationsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
