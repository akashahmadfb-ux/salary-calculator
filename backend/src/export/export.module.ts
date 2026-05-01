import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [ExportController],
  providers: [ExportService],
})
export class ExportModule {}
