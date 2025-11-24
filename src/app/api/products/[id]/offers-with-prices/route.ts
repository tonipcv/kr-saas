import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/products/[id]/offers-with-prices
 * Retorna ofertas com preços por país/provider e métodos de pagamento
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    const offers = await prisma.offer.findMany({
      where: { 
        productId: String(id),
        active: true 
      },
      orderBy: { createdAt: 'asc' },
      include: { 
        paymentMethods: {
          where: { active: true }
        },
        prices: {
          where: { active: true },
          orderBy: { country: 'asc' }
        }
      },
    });

    // Transformar para formato mais amigável
    const transformed = offers.map(offer => {
      // Agrupar preços por país
      const pricesByCountry: Record<string, Array<{
        provider: string;
        currency: string;
        amountCents: number;
        externalPriceId?: string | null;
      }>> = {};

      offer.prices.forEach(price => {
        if (!pricesByCountry[price.country]) {
          pricesByCountry[price.country] = [];
        }
        pricesByCountry[price.country].push({
          provider: price.provider,
          currency: price.currency,
          amountCents: price.amountCents,
          externalPriceId: price.externalPriceId
        });
      });

      // Listar países disponíveis
      const countries = Object.keys(pricesByCountry).sort();

      // Listar providers disponíveis (únicos)
      const providers = Array.from(new Set(offer.prices.map(p => p.provider)));

      return {
        id: offer.id,
        name: offer.name,
        description: offer.description,
        priceCents: offer.priceCents, // preço base (fallback)
        currency: offer.currency,
        maxInstallments: offer.maxInstallments,
        isSubscription: offer.isSubscription,
        intervalCount: offer.intervalCount,
        intervalUnit: offer.intervalUnit,
        trialDays: offer.trialDays,
        preferredProvider: offer.preferredProvider,
        paymentMethods: offer.paymentMethods.map(pm => pm.method),
        countries, // países com preços configurados
        providers, // providers com preços configurados
        pricesByCountry, // preços detalhados por país
      };
    });

    return NextResponse.json({ ok: true, offers: transformed });
  } catch (e: any) {
    console.error('[offers-with-prices] error', e);
    return NextResponse.json({ ok: false, error: e?.message || 'Failed to list offers' }, { status: 500 });
  }
}
