# Payment Method Normalization - Quick Reference

## Usage

### Display in UI (Frontend)

```typescript
import { labelForPaymentMethod } from '@/lib/payments/normalize';

// In charts, tables, badges
const label = labelForPaymentMethod(transaction.payment_method_type);
// Returns: 'Cartão', 'PIX', 'Boleto', 'Débito', or '—'
```

### Store in Database (Backend)

```typescript
import { normalizeForDB } from '@/lib/payments/normalize';

// When creating/updating payment_transactions
const method = normalizeForDB(rawMethod);
// Returns: 'credit_card', 'pix', 'boleto', 'debit_card', or null

await prisma.paymentTransaction.create({
  data: {
    paymentMethodType: method,
    // ...
  }
});
```

### Type-Safe Enum

```typescript
import { PaymentMethod } from '@/lib/providers/types';

// Use enum for type safety
const method: PaymentMethod = PaymentMethod.CREDIT_CARD;
```

## Supported Values

| Input Variants | Normalized Enum | Display Label |
|---------------|-----------------|---------------|
| `credit_card`, `CREDITCARD`, `card`, `CARTAO`, `Cartão` | `PaymentMethod.CREDIT_CARD` | `Cartão` |
| `debit_card`, `DEBITCARD`, `debit` | `PaymentMethod.DEBIT_CARD` | `Débito` |
| `pix`, `PIX` | `PaymentMethod.PIX` | `PIX` |
| `boleto`, `BANK_SLIP` | `PaymentMethod.BOLETO` | `Boleto` |

## Examples

### Dashboard Aggregation
```typescript
const methodBreakdown = useMemo(() => {
  const map = new Map<string, number>();
  for (const t of transactions) {
    const key = labelForPaymentMethod(t.payment_method_type);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries());
}, [transactions]);
```

### Webhook Handler
```typescript
const method = normalizeForDB(webhookData.payment_method);
await prisma.$executeRawUnsafe(
  `INSERT INTO payment_transactions (payment_method_type, ...) VALUES ($1, ...)`,
  method,
  // ...
);
```

### Badge Component
```typescript
const methodBadge = (method?: string | null) => {
  const label = labelForPaymentMethod(method || null);
  return <span className="badge">{label}</span>;
};
```

## Testing

```bash
npm run test src/lib/payments/__tests__/normalize.test.ts
```

## Documentation

- Full guide: `docs/PAYMENT_METHOD_NORMALIZATION.md`
- Implementation: `PAYMENT_METHOD_NORMALIZATION_IMPLEMENTATION.md`
