import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ExportService } from './export.service';

interface AuthUser { id: string }

@ApiTags('export')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('export')
export class ExportController {
  constructor(private readonly service: ExportService) {}

  @Get('pdf')
  @ApiOperation({ summary: 'Export transactions as PDF' })
  @ApiQuery({ name: 'from', example: '2026-01-01' })
  @ApiQuery({ name: 'to', example: '2026-04-30' })
  exportPdf(
    @CurrentUser() user: AuthUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: Response,
  ) {
    return this.service.exportPdf(user.id, from, to, res);
  }

  @Get('excel')
  @ApiOperation({ summary: 'Export transactions as Excel workbook' })
  @ApiQuery({ name: 'from', example: '2026-01-01' })
  @ApiQuery({ name: 'to', example: '2026-04-30' })
  exportExcel(
    @CurrentUser() user: AuthUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: Response,
  ) {
    return this.service.exportExcel(user.id, from, to, res);
  }
}
