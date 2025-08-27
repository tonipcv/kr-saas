import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      email,
      phone,
      message,
      doctorId,
      doctorSlug,
      productId,
    } = body || {};

    if (!email) {
      return NextResponse.json({ error: 'Email é obrigatório' }, { status: 400 });
    }

    // Resolve doctor by ID or slug
    let resolvedDoctorId: string | null = doctorId || null;
    if (!resolvedDoctorId && doctorSlug) {
      const doctor = await prisma.user.findFirst({
        where: { doctor_slug: doctorSlug, role: 'DOCTOR', is_active: true } as any,
        select: { id: true },
      });
      if (!doctor) {
        return NextResponse.json({ error: 'Médico não encontrado' }, { status: 404 });
      }
      resolvedDoctorId = doctor.id;
    }

    if (!resolvedDoctorId) {
      return NextResponse.json({ error: 'doctorId ou doctorSlug é obrigatório' }, { status: 400 });
    }

    // Optionally load product for context and confirmation URL
    let product: { id: string; name: string; confirmationUrl?: string | null } | null = null;
    if (productId) {
      product = await prisma.products.findFirst({
        where: { id: String(productId), doctorId: resolvedDoctorId } as any,
        select: { id: true, name: true, confirmationUrl: true },
      });
    }

    // Create referral lead with product origin
    const lead = await prisma.referralLead.create({
      data: {
        name: name?.trim() || 'Novo Lead',
        email: String(email).trim(),
        phone: phone?.trim() || null,
        message: message?.trim() || null,
        status: 'PENDING',
        source: product ? `product:${product.id}` : 'product',
        doctorId: resolvedDoctorId,
        customFields: {
          productId: product?.id || productId || null,
          productName: product?.name || null,
        },
      },
    });

    // Build redirect URL
    const params = new URLSearchParams();
    if (name) params.set('name', name);
    params.set('email', String(email));
    if (phone) params.set('whatsapp', String(phone));
    if (product?.id) params.set('productId', product.id);
    if (doctorSlug) params.set('doctor', String(doctorSlug));
    if (resolvedDoctorId) params.set('doctorId', String(resolvedDoctorId));

    const redirectUrl = (product?.confirmationUrl && product.confirmationUrl.trim())
      ? appendParams(product.confirmationUrl, params)
      : `/thank-you?${params.toString()}`;

    return NextResponse.json({ success: true, leadId: lead.id, redirectUrl });
  } catch (error) {
    console.error('[leads/submit] Error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

function appendParams(url: string, params: URLSearchParams): string {
  try {
    const hasProtocol = /^https?:\/\//i.test(url);
    const base = hasProtocol ? url : `${url.startsWith('/') ? '' : '/'}${url}`;
    const u = new URL(base, 'http://localhost');
    // If base is relative, using dummy origin; we strip it later
    params.forEach((v, k) => u.searchParams.set(k, v));
    const pathWithQuery = `${u.pathname}${u.search}`;
    return hasProtocol ? u.toString() : pathWithQuery;
  } catch {
    // Fallback: naive concatenation
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}${params.toString()}`;
  }
}
