import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OcrService } from './ocr.service';

class ParseReceiptDto {
  @IsString()
  image_base64!: string;
}

@ApiTags('ocr')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ocr')
export class OcrController {
  constructor(private readonly service: OcrService) {}

  @Post('receipt')
  @ApiOperation({ summary: 'Parse a receipt image and extract transaction fields' })
  parseReceipt(@Body() dto: ParseReceiptDto) {
    return this.service.parseReceipt(dto.image_base64);
  }
}
