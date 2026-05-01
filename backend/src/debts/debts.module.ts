import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { DebtsController } from './debts.controller';
import { DebtsService } from './debts.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [DebtsController],
  providers: [DebtsService],
})
export class DebtsModule {}
