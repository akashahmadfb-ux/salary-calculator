import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsDateString } from 'class-validator';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AiInsightsService } from './ai-insights.service';

class GenerateReflectionDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}

interface AuthUser { id: string }

@ApiTags('ai-insights')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai-insights')
export class AiInsightsController {
  constructor(private readonly service: AiInsightsService) {}

  /** Throttled to 10 requests per hour per user to control OpenAI costs */
  @Post('weekly-reflection')
  @Throttle({ short: { limit: 2, ttl: 60_000 }, medium: { limit: 10, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Generate a weekly poetic spending reflection' })
  generateWeekly(@CurrentUser() user: AuthUser, @Body() dto: GenerateReflectionDto) {
    return this.service.generateWeeklyReflection(user.id, dto.from, dto.to);
  }
}
