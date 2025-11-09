import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { openFinancePersistEnabled } from '@/lib/config';

export async function POST(req: NextRequest) {
  try {
    if (!openFinancePersistEnabled) {
      return NextResponse.json({ ok: true, skipped: true }, { status: 200 });
    }

    const body = await req.json();
    const {
      clinicId,
      userId,
      email,
      document,
      fullName,
      phones,
    } = body ?? {};

    if (!clinicId) return NextResponse.json({ error: 'clinicId required' }, { status: 400 });
    if (!email && !document && !userId) return NextResponse.json({ error: 'one of email, document, userId required' }, { status: 400 });

    const docDigits = typeof document === 'string' ? document.replace(/\D/g, '') : null;
    const phonesJson = phones ? JSON.stringify(phones) : null;

    // Match precedence: userId > (clinicId + document) > email
    const where: any = userId
      ? { user_id: userId }
      : docDigits
      ? { clinic_id: clinicId, document: docDigits }
      : { clinic_id: clinicId, email };

    // payment_customers table is legacy/custom; use $executeRawUnsafe for flexibility
    // Upsert-like behavior: try update first, then insert if no row was affected
    const updates: string[] = [];
    const params: any[] = [];

    if (email) { updates.push('email = $' + (params.push(email))); }
    if (docDigits) { updates.push('document = $' + (params.push(docDigits))); }
    if (fullName) { updates.push('full_name = $' + (params.push(fullName))); }
    if (phonesJson) { updates.push('phones_json = $' + (params.push(phonesJson))); }
    if (userId) { updates.push('user_id = $' + (params.push(userId))); }
    updates.push('updated_at = CURRENT_TIMESTAMP');

    const whereClauses: string[] = [];
    const whereParams: any[] = [];

    if (where.user_id) { whereClauses.push('user_id = $' + (params.length + whereParams.push(where.user_id))); }
    if (where.clinic_id) { whereClauses.push('clinic_id = $' + (params.length + whereParams.push(where.clinic_id))); }
    if (where.document) { whereClauses.push('document = $' + (params.length + whereParams.push(where.document))); }
    if (where.email) { whereClauses.push('email = $' + (params.length + whereParams.push(where.email))); }

    const updateSql = `UPDATE payment_customers SET ${updates.join(', ')} WHERE ${whereClauses.join(' AND ')}`;

    const updated = await prisma.$executeRawUnsafe(updateSql, ...params, ...whereParams);

    if (updated && Number(updated) > 0) {
      return NextResponse.json({ ok: true, updated: true }, { status: 200 });
    }

    // Insert path
    const insertCols: string[] = ['id'];
    const insertVals: string[] = ['gen_random_uuid()'];
    const insertParams: any[] = [];

    insertCols.push('clinic_id'); insertVals.push('$' + (insertParams.push(clinicId)));
    if (userId) { insertCols.push('user_id'); insertVals.push('$' + (insertParams.push(userId))); }
    if (email) { insertCols.push('email'); insertVals.push('$' + (insertParams.push(email))); }
    if (docDigits) { insertCols.push('document'); insertVals.push('$' + (insertParams.push(docDigits))); }
    if (fullName) { insertCols.push('full_name'); insertVals.push('$' + (insertParams.push(fullName))); }
    if (phonesJson) { insertCols.push('phones_json'); insertVals.push('$' + (insertParams.push(phonesJson))); }

    const insertSql = `INSERT INTO payment_customers (${insertCols.join(',')}) VALUES (${insertVals.join(',')})`;
    await prisma.$executeRawUnsafe(insertSql, ...insertParams);

    return NextResponse.json({ ok: true, created: true }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'unexpected error' }, { status: 500 });
  }
}
