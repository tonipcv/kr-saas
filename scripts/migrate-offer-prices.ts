import { prisma } from '@/lib/prisma'

async function ensureOfferPricesTable() {
  // Postgres DDL (id uses Prisma-generated cuid, so no DB default)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS offer_prices (
      id text PRIMARY KEY,
      offer_id text NOT NULL,
      country varchar(2) NOT NULL,
      currency "Currency" NOT NULL,
      provider "PaymentProvider" NOT NULL,
      amount_cents integer NOT NULL DEFAULT 0,
      external_price_id text NULL,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT offer_prices_offer_fk FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS offer_prices_offer_ccy_prov_unique ON offer_prices(offer_id, country, currency, provider);
    CREATE INDEX IF NOT EXISTS offer_prices_offer_idx ON offer_prices(offer_id);
    CREATE INDEX IF NOT EXISTS offer_prices_country_currency_idx ON offer_prices(country, currency);
  `)
}

function isCC(x: string): boolean { return /^[A-Z]{2}$/.test(x) }
function toInt(n: any): number | null { const v = Number(n); return Number.isFinite(v) ? Math.trunc(v) : null }

async function backfillFromProviderConfig() {
  const offers = await prisma.offer.findMany({ select: { id: true, providerConfig: true } })
  let created = 0, updated = 0, skipped = 0
  for (const o of offers) {
    const cfg: any = (o as any).providerConfig || {}
    if (!cfg || typeof cfg !== 'object') { skipped++; continue }

    const entries: Array<{ country: string; currency: 'BRL'|'USD'|'EUR'; provider: any; amountCents: number; externalPriceId?: string }>= []

    // STRIPE country overrides: cfg.STRIPE[CC][CUR].amountCents / externalPriceId
    try {
      const S = cfg.STRIPE || {}
      for (const cc of Object.keys(S || {})) {
        if (!isCC(cc)) continue
        const layer = S[cc] || {}
        for (const cur of Object.keys(layer || {})) {
          const leaf = layer[cur] || {}
          const amt = toInt(leaf.amountCents)
          const pid = typeof leaf.externalPriceId === 'string' ? leaf.externalPriceId : undefined
          if ((amt && amt > 0) || pid) {
            entries.push({ country: cc.toUpperCase(), currency: cur.toUpperCase(), provider: 'STRIPE', amountCents: amt || 0, externalPriceId: pid })
          }
        }
      }
    } catch {}

    // KRXPAY country overrides: cfg.KRXPAY[CC][CUR].amountCents
    try {
      const K = cfg.KRXPAY || {}
      for (const cc of Object.keys(K || {})) {
        if (!isCC(cc)) continue
        const layer = K[cc] || {}
        for (const cur of Object.keys(layer || {})) {
          const leaf = layer[cur] || {}
          const amt = toInt(leaf.amountCents)
          if (amt && amt > 0) {
            entries.push({ country: cc.toUpperCase(), currency: cur.toUpperCase(), provider: 'KRXPAY', amountCents: amt })
          }
        }
      }
    } catch {}

    for (const e of entries) {
      try {
        const up = await prisma.offerPrice.upsert({
          where: { offerId_country_currency_provider: { offerId: o.id, country: e.country, currency: e.currency as any, provider: e.provider as any } },
          update: { amountCents: e.amountCents, externalPriceId: e.externalPriceId, active: true },
          create: { offerId: o.id, country: e.country, currency: e.currency as any, provider: e.provider as any, amountCents: e.amountCents, externalPriceId: e.externalPriceId, active: true },
        })
        if ((up as any).createdAt?.toString() === (up as any).updatedAt?.toString()) created++; else updated++
      } catch (err) {
        console.warn('upsert OfferPrice failed', { offerId: o.id, entry: e, err: (err as any)?.message })
      }
    }
  }
  console.log(`[OfferPrice] backfill done: created=${created} updated=${updated} skipped_offers=${skipped}`)
}

async function main() {
  await ensureOfferPricesTable()
  await backfillFromProviderConfig()
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); })
