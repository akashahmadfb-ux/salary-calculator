import { IsDateString, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSavingsGoalDto {
  @ApiProperty({ example: 'Emergency fund' })
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiProperty({ example: 50000 })
  @IsNumber()
  @Min(1)
  target_amount!: number;

  @ApiProperty({ example: 'BDT' })
  @IsString()
  currency!: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  deadline?: string;

  @ApiPropertyOptional({ example: 'savings' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  branch_emoji?: string;
}
