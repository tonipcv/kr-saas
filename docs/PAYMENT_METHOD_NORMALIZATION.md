# Payment Method Normalization

## Overview

Payment methods are normalized throughout the system using utilities in `src/lib/payments/normalize.ts` to ensure consistency across:
- Database storage (`payment_transactions.payment_method_type`)
- UI display (charts, tables, badges)
- API responses and webhooks

## Canonical Values

The system uses the `PaymentMethod` enum from `src/lib/providers/types.ts`:

```typescript
export enum PaymentMethod {
  CREDIT_CARD = 'credit_card',
  DEBIT_CARD = 'debit_card',
  PIX = 'pix',
  BOLETO = 'boleto',
}
```

## Normalization Functions

### `normalizePaymentMethod(raw?: string | null): PaymentMethod | null`

Converts any payment method string variant to the canonical enum value.

**Handles:**
- `CREDIT_CARD`, `CREDITCARD`, `CREDIT-CARD`, `CARD`, `CARTAO`, `CARTÃO` → `PaymentMethod.CREDIT_CARD`
- `DEBIT_CARD`, `DEBITCARD`, `DEBIT-CARD`, `DEBIT` → `PaymentMethod.DEBIT_CARD`
- `PIX` → `PaymentMethod.PIX`
- `BOLETO`, `BANK_SLIP`, `BANKSLIP` → `PaymentMethod.BOLETO`

### `labelForPaymentMethod(method: PaymentMethod | string | null): string`

Returns user-friendly labels for UI display:
- `PaymentMethod.CREDIT_CARD` → `"Cartão"`
- `PaymentMethod.DEBIT_CARD` → `"Débito"`
- `PaymentMethod.PIX` → `"PIX"`
- `PaymentMethod.BOLETO` → `"Boleto"`

### `normalizeForDB(raw?: string | null): string | null`

Returns the canonical enum value as a string for database storage.
Use this when inserting/updating `payment_transactions.payment_method_type`.

## Usage Guidelines

### Frontend (Display)

Always use `labelForPaymentMethod()` when displaying payment methods to users:

```typescript
import { labelForPaymentMethod } from '@/lib/payments/normalize';

// In charts
const methodBreakdown = useMemo(() => {
  const map = new Map<string, number>();
  for (const t of transactions) {
    const key = labelForPaymentMethod(t.payment_method_type);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries());
}, [transactions]);

// In tables/badges
const label = labelForPaymentMethod(transaction.payment_method_type);
```

### Backend (Database Writes)

Use `normalizeForDB()` when writing to `payment_transactions`:

```typescript
import { normalizeForDB } from '@/lib/payments/normalize';

await prisma.paymentTransaction.create({
  data: {
    // ... other fields
    paymentMethodType: normalizeForDB(rawMethod),
  }
});

// Or in raw SQL
await prisma.$executeRawUnsafe(
  `INSERT INTO payment_transactions (payment_method_type, ...) VALUES ($1, ...)`,
  normalizeForDB(rawMethod),
  // ... other params
);
```

### Webhooks

Normalize incoming webhook data before storing:

```typescript
import { normalizeForDB } from '@/lib/payments/normalize';

const method = normalizeForDB(webhookData.payment_method || webhookData.method);
```

## Migration Strategy

### Existing Data

To normalize historical data in `payment_transactions`:

```sql
-- Normalize credit card variants
UPDATE payment_transactions
SET payment_method_type = 'credit_card'
WHERE payment_method_type IN ('CREDITCARD', 'CREDIT-CARD', 'CARD', 'CARTAO', 'CARTÃO')
  AND payment_method_type != 'credit_card';

-- Normalize boleto variants
UPDATE payment_transactions
SET payment_method_type = 'boleto'
WHERE payment_method_type IN ('BANK_SLIP', 'BANKSLIP')
  AND payment_method_type != 'boleto';

-- Normalize debit card variants
UPDATE payment_transactions
SET payment_method_type = 'debit_card'
WHERE payment_method_type IN ('DEBITCARD', 'DEBIT-CARD', 'DEBIT')
  AND payment_method_type != 'debit_card';
```

### New Code

All new code should:
1. Use `normalizeForDB()` when writing to database
2. Use `labelForPaymentMethod()` when displaying to users
3. Never hardcode method strings like `'CREDITCARD'` or `'Cartão'`

## Files Updated

### Core Utilities
- ✅ `src/lib/payments/normalize.ts` - Normalization functions

### Frontend Components
- ✅ `src/app/(authenticated)/business/dashboard/page.tsx` - Dashboard charts
- ✅ `src/components/business/TransactionsTable.tsx` - Transaction table and details

### Backend (To Update)
- ⚠️ `src/lib/providers/pagarme/legacy.ts` - Already uses 'credit_card'
- ⚠️ `src/lib/payments/vault/manager.ts` - Already uses 'credit_card'
- ⚠️ `src/app/api/checkout/appmax/create/route.ts` - Uses ternary, could normalize
- ⚠️ `src/app/api/webhooks/appmax/route.ts` - Uses COALESCE, preserves existing
- ⚠️ Other webhook handlers - Most already use canonical values

## Testing

After applying normalization:

1. **Dashboard Charts**: Verify "Methods" donut shows single "Cartão" segment (not split)
2. **Transaction Table**: Verify method badges display correctly
3. **Transaction Details**: Verify method label in modal
4. **API Responses**: Verify `payment_method_type` uses canonical values

## Benefits

- ✅ Consistent data in database
- ✅ Accurate aggregations and charts
- ✅ Easier to add new payment methods
- ✅ Type-safe with TypeScript enum
- ✅ Single source of truth for labels
- ✅ Easier to maintain and extend
