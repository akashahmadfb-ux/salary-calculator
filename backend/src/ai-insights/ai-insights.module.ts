import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { AiInsightsController } from './ai-insights.controller';
import { AiInsightsService } from './ai-insights.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [AiInsightsController],
  providers: [AiInsightsService],
})
export class AiInsightsModule {}
