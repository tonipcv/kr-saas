// Node JS migration/backfill for OfferPrice
// Usage:
//   1) npx prisma generate
//   2) node scripts/migrate-offer-prices.js

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function ensureOfferPricesTable() {
  // Run each statement separately; Prisma does not allow multiple commands per prepared statement
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
    )`)
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS offer_prices_offer_ccy_prov_unique ON offer_prices(offer_id, country, currency, provider)`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS offer_prices_offer_idx ON offer_prices(offer_id)`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS offer_prices_country_currency_idx ON offer_prices(country, currency)`)
}

function isCC(x) { return /^[A-Z]{2}$/.test(x || '') }
function toInt(n) { const v = Number(n); return Number.isFinite(v) ? Math.trunc(v) : null }
function cuid() {
  // lightweight cuid-like: 'c' + timestamp + random
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

async function backfillFromProviderConfig() {
  const offers = await prisma.offer.findMany({ select: { id: true, providerConfig: true } })
  let created = 0, updated = 0, skipped = 0
  for (const o of offers) {
    const cfg = o.providerConfig || {}
    if (!cfg || typeof cfg !== 'object') { skipped++; continue }

    const entries = []

    // STRIPE country overrides
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
            entries.push({ country: cc.toUpperCase(), currency: String(cur).toUpperCase(), provider: 'STRIPE', amountCents: amt || 0, externalPriceId: pid })
          }
        }
      }
    } catch {}

    // KRXPAY country overrides
    try {
      const K = cfg.KRXPAY || {}
      for (const cc of Object.keys(K || {})) {
        if (!isCC(cc)) continue
        const layer = K[cc] || {}
        for (const cur of Object.keys(layer || {})) {
          const leaf = layer[cur] || {}
          const amt = toInt(leaf.amountCents)
          if (amt && amt > 0) {
            entries.push({ country: cc.toUpperCase(), currency: String(cur).toUpperCase(), provider: 'KRXPAY', amountCents: amt })
          }
        }
      }
    } catch {}

    for (const e of entries) {
      try {
        // Prefer Prisma Model upsert if available (after prisma generate)
        if (prisma.offerPrice && prisma.offerPrice.upsert) {
          await prisma.offerPrice.upsert({
            where: { offerId_country_currency_provider: { offerId: o.id, country: e.country, currency: e.currency, provider: e.provider } },
            update: { amountCents: e.amountCents, externalPriceId: e.externalPriceId, active: true },
            create: { id: cuid(), offerId: o.id, country: e.country, currency: e.currency, provider: e.provider, amountCents: e.amountCents, externalPriceId: e.externalPriceId, active: true },
          })
        } else {
          // Fallback to raw SQL upsert if the generated client is not updated yet
          await prisma.$executeRawUnsafe(
            `INSERT INTO offer_prices (id, offer_id, country, currency, provider, amount_cents, external_price_id, active)
             VALUES ($1, $2, $3, $4::"Currency", $5::"PaymentProvider", $6, $7, true)
             ON CONFLICT (offer_id, country, currency, provider)
             DO UPDATE SET amount_cents = EXCLUDED.amount_cents, external_price_id = EXCLUDED.external_price_id, active = true, updated_at = now()`,
            cuid(), o.id, e.country, e.currency, e.provider, e.amountCents, e.externalPriceId || null
          )
        }
        created++
      } catch (err) {
        // If conflict path updated, count as updated
        updated++
        // console.warn('upsert OfferPrice failed', { offerId: o.id, entry: e, err: err && err.message })
      }
    }
  }
  console.log(`[OfferPrice] backfill done: created_or_upserted=${created} updated_conflicts=${updated} skipped_offers=${skipped}`)
}

async function main() {
  await ensureOfferPricesTable()
  await backfillFromProviderConfig()
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); })
