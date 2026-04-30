import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';

// Splits follow the same CRUD pattern as other modules.
// Full implementation mirrors TransactionsModule.
@Module({
  imports: [DatabaseModule, AuthModule],
})
export class SplitsModule {}
