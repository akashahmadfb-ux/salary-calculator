import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type TransactionCategory =
  | 'needs'
  | 'wants'
  | 'savings'
  | 'debt_payment'
  | 'income'
  | 'transfer';

export type MoodTag = 'happy' | 'sad' | 'anxious' | 'neutral' | 'excited' | 'tired' | 'grateful';

export class CreateTransactionDto {
  @ApiProperty({ example: 150.5 })
  @IsNumber()
  @Min(0)
  amount!: number;

  @ApiProperty({ example: 'BDT' })
  @IsString()
  @IsNotEmpty()
  currency!: string;

  @ApiProperty({ enum: ['needs', 'wants', 'savings', 'debt_payment', 'income', 'transfer'] })
  @IsEnum(['needs', 'wants', 'savings', 'debt_payment', 'income', 'transfer'])
  category!: TransactionCategory;

  @ApiPropertyOptional({ example: 'Cafe Waltz' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  merchant?: string;

  @ApiPropertyOptional({ example: 'Had a quiet coffee while it rained.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({ enum: ['happy', 'sad', 'anxious', 'neutral', 'excited', 'tired', 'grateful'] })
  @IsOptional()
  @IsEnum(['happy', 'sad', 'anxious', 'neutral', 'excited', 'tired', 'grateful'])
  mood_tag?: MoodTag;

  @ApiPropertyOptional({ example: 'coffee' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  emoji_tag?: string;

  @ApiProperty({ example: '2026-04-30' })
  @IsDateString()
  transaction_date!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  receipt_url?: string;
}
