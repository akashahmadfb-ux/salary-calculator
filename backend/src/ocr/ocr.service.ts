import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface OcrResult {
  merchant: string | null;
  amount: number | null;
  currency: string | null;
  date: string | null;
  raw: unknown;
}

@Injectable()
export class OcrService {
  constructor(private readonly config: ConfigService) {}

  /**
   * Send a receipt image (as base64 or URL) to the Mindee Receipt API.
   * Returns parsed fields ready to pre-fill the transaction form.
   * The API key is kept server-side — never exposed to the client.
   */
  async parseReceipt(imageBase64: string): Promise<OcrResult> {
    const apiKey = this.config.getOrThrow<string>('MINDEE_API_KEY');

    const formData = new FormData();
    // Convert base64 to a Blob
    const binary = Buffer.from(imageBase64, 'base64');
    const blob = new Blob([binary], { type: 'image/jpeg' });
    formData.append('document', blob, 'receipt.jpg');

    const response = await axios.post(
      'https://api.mindee.net/v1/products/mindee/expense_receipts/v5/predict',
      formData,
      {
        headers: {
          Authorization: `Token ${apiKey}`,
          'Content-Type': 'multipart/form-data',
        },
        timeout: 30_000,
      },
    );

    const prediction = response.data?.document?.inference?.prediction;

    return {
      merchant: prediction?.supplier_name?.value ?? null,
      amount: prediction?.total_amount?.value ?? null,
      currency: prediction?.locale?.currency ?? null,
      date: prediction?.date?.value ?? null,
      raw: prediction,
    };
  }
}
