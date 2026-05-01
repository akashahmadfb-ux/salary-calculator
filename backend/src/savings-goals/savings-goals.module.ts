import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { SavingsGoalsController } from './savings-goals.controller';
import { SavingsGoalsService } from './savings-goals.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [SavingsGoalsController],
  providers: [SavingsGoalsService],
  exports: [SavingsGoalsService],
})
export class SavingsGoalsModule {}
