import { Injectable, Inject } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Response } from 'express';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

import { SUPABASE_CLIENT } from '../database/database.module';

@Injectable()
export class ExportService {
  constructor(@Inject(SUPABASE_CLIENT) private readonly db: SupabaseClient) {}

  async exportPdf(userId: string, from: string, to: string, res: Response): Promise<void> {
    const { data: transactions } = await this.db
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .gte('transaction_date', from)
      .lte('transaction_date', to)
      .order('transaction_date', { ascending: true });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="ioknbo-export-${from}-to-${to}.pdf"`,
    );

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    doc.pipe(res);

    // Title
    doc
      .fontSize(22)
      .font('Helvetica-Bold')
      .text("It's Okay to Not Be Okay — Expense Report", { align: 'center' });
    doc.moveDown(0.5);
    doc
      .fontSize(11)
      .font('Helvetica')
      .text(`Period: ${from} to ${to}`, { align: 'center' });
    doc.moveDown(1);

    // Table header
    const colX = [50, 120, 220, 310, 410, 490];
    const headers = ['Date', 'Merchant', 'Category', 'Note', 'Currency', 'Amount'];
    doc.fontSize(9).font('Helvetica-Bold');
    headers.forEach((h, i) => doc.text(h, colX[i], doc.y, { width: 90, continued: i < headers.length - 1 }));
    doc.moveDown(0.4);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.3);

    // Rows
    doc.font('Helvetica').fontSize(8);
    let total = 0;
    for (const t of transactions ?? []) {
      const y = doc.y;
      const cols = [t.transaction_date, t.merchant ?? '-', t.category, t.note ?? '-', t.currency, t.amount.toFixed(2)];
      cols.forEach((val, i) => doc.text(String(val), colX[i], y, { width: 90, continued: i < cols.length - 1 }));
      doc.moveDown(0.3);
      if (t.category !== 'income') total += t.amount;
    }

    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica-Bold').text(`Total Expenses: ${total.toFixed(2)}`, 410);
    doc.end();
  }

  async exportExcel(userId: string, from: string, to: string, res: Response): Promise<void> {
    const { data: transactions } = await this.db
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .gte('transaction_date', from)
      .lte('transaction_date', to)
      .order('transaction_date', { ascending: true });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'IOKNBO Finance Tracker';
    const ws = wb.addWorksheet('Transactions');

    ws.columns = [
      { header: 'Date', key: 'transaction_date', width: 14 },
      { header: 'Merchant', key: 'merchant', width: 22 },
      { header: 'Category', key: 'category', width: 16 },
      { header: 'Note', key: 'note', width: 30 },
      { header: 'Mood', key: 'mood_tag', width: 12 },
      { header: 'Currency', key: 'currency', width: 10 },
      { header: 'Amount', key: 'amount', width: 14 },
    ];

    // Style header row
    ws.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D1226' } };
    });

    for (const t of transactions ?? []) {
      ws.addRow({
        transaction_date: t.transaction_date,
        merchant: t.merchant ?? '',
        category: t.category,
        note: t.note ?? '',
        mood_tag: t.mood_tag ?? '',
        currency: t.currency,
        amount: t.amount,
      });
    }

    // Total row
    const lastRow = ws.lastRow?.number ?? 1;
    ws.addRow({});
    const totalRow = ws.addRow({ merchant: 'TOTAL', amount: { formula: `SUM(G2:G${lastRow})` } });
    totalRow.font = { bold: true };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="ioknbo-export-${from}-to-${to}.xlsx"`,
    );

    await wb.xlsx.write(res);
    res.end();
  }
}
