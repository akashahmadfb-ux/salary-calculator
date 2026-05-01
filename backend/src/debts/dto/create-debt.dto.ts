import {
  IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDebtDto {
  @ApiProperty({ example: 'Rahul' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  counterparty_name!: string;

  @ApiProperty({ enum: ['borrowed', 'lent'] })
  @IsEnum(['borrowed', 'lent'])
  direction!: 'borrowed' | 'lent';

  @ApiProperty({ example: 2000 })
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiProperty({ example: 'BDT' })
  @IsString()
  currency!: string;

  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsOptional()
  @IsDateString()
  due_date?: string;

  @ApiPropertyOptional({ example: 'Borrowed for birthday dinner.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
