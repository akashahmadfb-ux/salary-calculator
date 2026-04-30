import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

import { AuthModule } from './auth/auth.module';
import { TransactionsModule } from './transactions/transactions.module';
import { SavingsGoalsModule } from './savings-goals/savings-goals.module';
import { DebtsModule } from './debts/debts.module';
import { SplitsModule } from './splits/splits.module';
import { AiInsightsModule } from './ai-insights/ai-insights.module';
import { OcrModule } from './ocr/ocr.module';
import { ExportModule } from './export/export.module';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [
    // Global config — reads .env
    ConfigModule.forRoot({ isGlobal: true }),

    // Rate limiting — AI endpoints are throttled more aggressively
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 20 },
      { name: 'medium', ttl: 60_000, limit: 200 },
    ]),

    // Infrastructure
    DatabaseModule,

    // Feature modules
    AuthModule,
    TransactionsModule,
    SavingsGoalsModule,
    DebtsModule,
    SplitsModule,
    AiInsightsModule,
    OcrModule,
    ExportModule,
  ],
})
export class AppModule {}
