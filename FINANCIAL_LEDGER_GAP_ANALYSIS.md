# Gap Analysis: Sistema Ledger Contábil Completo

## Data: 2025-11-19
## Objetivo: Transformar o sistema em um General Ledger (GL) com double-entry accounting

---

## 📊 ESTADO ATUAL

### O que JÁ temos:
1. ✅ **PaymentTransaction** - registro de transações de pagamento (single-entry)
2. ✅ **PointsLedger** - ledger de pontos/fidelidade (append-only)
3. ✅ **CustomerSubscription** - assinaturas recorrentes
4. ✅ **WebhookEvent** - auditoria de eventos externos
5. ✅ **Event** - event sourcing para analytics

### O que É ledger:
- `PointsLedger`: ✅ Append-only ledger (pontos) com `sourceType`, `sourceId`, `amount`
- `PaymentTransaction`: ⚠️ Transaction log (NOT a true ledger - falta double-entry)

### O que NÃO é ledger:
- Falta **Account** (plano de contas)
- Falta **JournalEntry** (lançamentos contábeis)
- Falta **GeneralLedger** (razão geral)
- Falta reconciliação bancária
- Falta demonstrativos financeiros (DRE, Balanço)

---

## 🎯 O QUE FALTA PARA UM LEDGER COMPLETO

## 1. CHART OF ACCOUNTS (Plano de Contas)

```prisma
model Account {
  id           String       @id @default(cuid())
  code         String       // 1.1.01.001 (Assets.Current.Cash.MainAccount)
  name         String       // "Caixa Principal"
  type         AccountType  // ASSET|LIABILITY|EQUITY|REVENUE|EXPENSE
  category     String       // "CURRENT_ASSETS"
  parentId     String?      // hierarchical chart
  parent       Account?     @relation("AccountHierarchy", fields: [parentId], references: [id])
  children     Account[]    @relation("AccountHierarchy")
  
  merchantId   String?      // multi-tenant
  clinicId     String?
  
  isActive     Boolean      @default(true)
  isSystem     Boolean      @default(false) // system accounts
  normalBalance DebitCredit  @default(DEBIT) // DEBIT or CREDIT
  
  metadata     Json?
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt
  
  // Back-relations
  ledgerEntries LedgerEntry[]
  
  @@unique([merchantId, code])
  @@index([type, isActive])
  @@map("accounts")
}

enum AccountType {
  ASSET       // Ativo
  LIABILITY   // Passivo
  EQUITY      // Patrimônio Líquido
  REVENUE     // Receita
  EXPENSE     // Despesa
}

enum DebitCredit {
  DEBIT
  CREDIT
}
```

**Exemplos de contas**:
```
1.1.01.001 - Caixa Principal (ASSET)
1.1.02.001 - Stripe Balance (ASSET)
1.1.02.002 - Pagarme Balance (ASSET)
2.1.01.001 - Contas a Pagar (LIABILITY)
3.1.01.001 - Capital Social (EQUITY)
4.1.01.001 - Receita de Vendas (REVENUE)
5.1.01.001 - Taxa de Gateway (EXPENSE)
5.1.01.002 - Comissão Plataforma (EXPENSE)
```

---

## 2. JOURNAL ENTRIES (Lançamentos Contábeis)

```prisma
model JournalEntry {
  id              String        @id @default(cuid())
  entryNumber     String        @unique // JE-2025-001234
  entryDate       DateTime      // data do lançamento contábil
  postingDate     DateTime?     // data da postagem (pode diferir)
  
  merchantId      String?
  clinicId        String?
  
  description     String        // "Venda produto X via Stripe"
  reference       String?       // "payment_transaction:pt_123"
  referenceType   String?       // "PAYMENT"|"REFUND"|"SUBSCRIPTION"|"MANUAL"
  referenceId     String?       // FK to PaymentTransaction, etc
  
  status          EntryStatus   @default(PENDING)
  isReversed      Boolean       @default(false)
  reversalOfId    String?       // FK to reversed entry
  reversedById    String?       // FK to reversing entry
  
  createdBy       String?       // userId
  approvedBy      String?
  approvedAt      DateTime?
  
  metadata        Json?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  
  // Relations
  lineItems       LedgerEntry[]
  reversalOf      JournalEntry? @relation("EntryReversal", fields: [reversalOfId], references: [id])
  reversedBy      JournalEntry? @relation("EntryReversal")
  
  @@index([merchantId, entryDate])
  @@index([referenceType, referenceId])
  @@index([status])
  @@map("journal_entries")
}

enum EntryStatus {
  PENDING     // Rascunho
  POSTED      // Lançado
  REVERSED    // Estornado
  VOID        // Cancelado
}
```

---

## 3. LEDGER ENTRIES (Partidas Dobradas)

```prisma
model LedgerEntry {
  id             String        @id @default(cuid())
  journalEntryId String
  journalEntry   JournalEntry  @relation(fields: [journalEntryId], references: [id], onDelete: Cascade)
  
  accountId      String
  account        Account       @relation(fields: [accountId], references: [id])
  
  type           DebitCredit   // DEBIT or CREDIT
  amountCents    Int           // sempre positivo
  currency       String        @default("BRL")
  
  description    String?       // override da linha
  lineNumber     Int           @default(1)
  
  metadata       Json?
  createdAt      DateTime      @default(now())
  
  @@index([journalEntryId])
  @@index([accountId, createdAt])
  @@map("ledger_entries")
}
```

**Regra fundamental**: Para cada `JournalEntry`, a soma dos débitos DEVE ser igual à soma dos créditos.

**Exemplo de lançamento**:
```typescript
// Venda de R$ 100,00 via Stripe (taxa 3.99%)
const entries = [
  { account: "1.1.02.001", type: "DEBIT",  amount: 9601 },  // Stripe Balance
  { account: "5.1.01.001", type: "DEBIT",  amount: 399 },   // Taxa Gateway
  { account: "4.1.01.001", type: "CREDIT", amount: 10000 }, // Receita Vendas
];
// Total DEBIT: 10000 | Total CREDIT: 10000 ✅
```

---

## 4. PAYMENT SETTLEMENT (Liquidação)

```prisma
model PaymentSettlement {
  id                 String   @id @default(cuid())
  provider           PaymentProvider
  accountId          String   // merchant account
  merchantId         String
  
  settlementId       String   // ID do provider (Stripe payout ID, Pagarme transfer ID)
  settlementDate     DateTime // data que o dinheiro caiu na conta
  expectedDate       DateTime?
  
  amountCents        Int      // valor bruto
  feeCents           Int      @default(0)
  netAmountCents     Int      // líquido
  currency           String   @default("BRL")
  
  status             SettlementStatus
  
  journalEntryId     String?  @unique // FK to journal entry
  journalEntry       JournalEntry?
  
  bankAccount        String?  // conta bancária destino
  rawPayload         Json?
  
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  
  @@index([merchantId, settlementDate])
  @@index([provider, status])
  @@map("payment_settlements")
}

enum SettlementStatus {
  PENDING
  IN_TRANSIT
  PAID
  FAILED
  CANCELED
}
```

**Lançamento de settlement**:
```typescript
// Quando Stripe paga R$ 1.000,00 (de R$ 1.039,00 bruto - R$ 39,00 taxa)
const entries = [
  { account: "1.1.01.001", type: "DEBIT",  amount: 100000 }, // Banco
  { account: "1.1.02.001", type: "CREDIT", amount: 100000 }, // Stripe Balance
];
```

---

## 5. RECONCILIATION LOG (Conciliação Bancária)

```prisma
model BankReconciliation {
  id                 String   @id @default(cuid())
  merchantId         String
  accountId          String   // Account (bank account)
  
  periodStart        DateTime
  periodEnd          DateTime
  
  openingBalance     Int      // saldo inicial (centavos)
  closingBalance     Int      // saldo final (centavos)
  statementBalance   Int      // saldo no extrato bancário
  
  reconciledBalance  Int      // saldo reconciliado
  difference         Int      @default(0) // diferença não explicada
  
  status             ReconciliationStatus
  reconciledBy       String?
  reconciledAt       DateTime?
  
  notes              String?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  
  @@index([merchantId, periodStart])
  @@map("bank_reconciliations")
}

enum ReconciliationStatus {
  IN_PROGRESS
  RECONCILED
  DISCREPANCY
}
```

---

## 6. TAX RECORDS (Registros Fiscais)

```prisma
model TaxRecord {
  id                String    @id @default(cuid())
  merchantId        String
  taxType           TaxType   // ICMS, PIS, COFINS, ISS, etc
  
  referenceType     String    // "PAYMENT"|"SUBSCRIPTION"|"INVOICE"
  referenceId       String
  
  taxRate           Decimal   @db.Decimal(5,2) // 5.00% = 5.00
  baseCents         Int       // base de cálculo
  taxCents          Int       // imposto calculado
  
  dueDate           DateTime?
  paidDate          DateTime?
  status            TaxStatus
  
  journalEntryId    String?
  
  metadata          Json?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  
  @@index([merchantId, taxType, dueDate])
  @@map("tax_records")
}

enum TaxType {
  ICMS
  PIS
  COFINS
  ISS
  IRPJ
  CSLL
}

enum TaxStatus {
  PENDING
  PAID
  OVERDUE
  WAIVED
}
```

---

## 7. CASH FLOW STATEMENT (DFC - Demonstração de Fluxo de Caixa)

```prisma
model CashFlowEntry {
  id           String         @id @default(cuid())
  merchantId   String
  clinicId     String?
  
  date         DateTime
  category     CashFlowCategory
  subcategory  String?
  
  amountCents  Int            // positivo = entrada, negativo = saída
  currency     String         @default("BRL")
  
  description  String
  reference    String?        // FK to payment/settlement/etc
  
  createdAt    DateTime       @default(now())
  
  @@index([merchantId, date, category])
  @@map("cash_flow_entries")
}

enum CashFlowCategory {
  OPERATING     // Atividades operacionais
  INVESTING     // Atividades de investimento
  FINANCING     // Atividades de financiamento
}
```

---

## 8. GENERAL LEDGER VIEW (Razão Geral - Computed)

```sql
-- View: Saldo por conta
CREATE OR REPLACE VIEW general_ledger AS
SELECT 
  a.id as account_id,
  a.code as account_code,
  a.name as account_name,
  a.type as account_type,
  a.normal_balance,
  COALESCE(SUM(
    CASE 
      WHEN le.type = 'DEBIT' THEN le.amount_cents
      ELSE -le.amount_cents
    END
  ), 0) as balance_cents
FROM accounts a
LEFT JOIN ledger_entries le ON le.account_id = a.id
LEFT JOIN journal_entries je ON je.id = le.journal_entry_id
WHERE je.status = 'POSTED' OR je.status IS NULL
GROUP BY a.id, a.code, a.name, a.type, a.normal_balance;
```

---

## 🔄 INTEGRAÇÃO COM SISTEMA ATUAL

### Automação: PaymentTransaction → JournalEntry

```typescript
// src/lib/ledger/auto-journal.ts

export async function createJournalEntryFromPayment(
  paymentId: string
): Promise<JournalEntry> {
  const payment = await prisma.paymentTransaction.findUnique({
    where: { id: paymentId },
    include: { merchant: true }
  });
  
  if (!payment) throw new Error('Payment not found');
  
  const { amountCents, provider, merchantId } = payment;
  
  // Resolver contas do chart of accounts
  const revenueAccount = await getAccount(merchantId, 'REVENUE');
  const arAccount = await getAccount(merchantId, `AR_${provider.toUpperCase()}`); // Accounts Receivable
  const feeAccount = await getAccount(merchantId, 'GATEWAY_FEE');
  
  // Calcular taxa (ex: 3.99% Stripe)
  const feeRate = getProviderFeeRate(provider);
  const feeCents = Math.round(amountCents * feeRate);
  const netCents = amountCents - feeCents;
  
  // Criar lançamento
  return await prisma.journalEntry.create({
    data: {
      merchantId,
      description: `Venda via ${provider}`,
      reference: `payment_transaction:${paymentId}`,
      referenceType: 'PAYMENT',
      referenceId: paymentId,
      status: 'POSTED',
      lineItems: {
        create: [
          // DEBIT: AR (receivable no gateway)
          { accountId: arAccount.id, type: 'DEBIT', amountCents: netCents },
          // DEBIT: Fee
          { accountId: feeAccount.id, type: 'DEBIT', amountCents: feeCents },
          // CREDIT: Revenue
          { accountId: revenueAccount.id, type: 'CREDIT', amountCents },
        ]
      }
    },
    include: { lineItems: true }
  });
}
```

---

## 📊 DEMONSTRATIVOS FINANCEIROS

### Balance Sheet (Balanço Patrimonial)
```sql
SELECT 
  account_type,
  SUM(balance_cents) as total_cents
FROM general_ledger
WHERE account_type IN ('ASSET', 'LIABILITY', 'EQUITY')
GROUP BY account_type;
```

### Income Statement (DRE - Demonstração do Resultado do Exercício)
```sql
SELECT 
  account_type,
  account_code,
  account_name,
  balance_cents
FROM general_ledger
WHERE account_type IN ('REVENUE', 'EXPENSE')
  AND created_at BETWEEN '2025-01-01' AND '2025-12-31'
ORDER BY account_code;
```

---

## 🎯 ROADMAP DE IMPLEMENTAÇÃO

### Fase 1: FOUNDATION (Semana 1-2)
- [ ] Criar models: `Account`, `JournalEntry`, `LedgerEntry`
- [ ] Seed chart of accounts padrão (Brazilian GAAP)
- [ ] Testes unitários de double-entry validation

### Fase 2: AUTOMATION (Semana 3-4)
- [ ] Auto-create journal entries from `PaymentTransaction`
- [ ] Webhook handlers para settlement (Stripe payouts, Pagarme transfers)
- [ ] Background job para reconciliação diária

### Fase 3: RECONCILIATION (Semana 5-6)
- [ ] `BankReconciliation` model
- [ ] Import de OFX/CSV (extratos bancários)
- [ ] UI para match manual de discrepâncias

### Fase 4: REPORTING (Semana 7-8)
- [ ] Views SQL para GL, Balance Sheet, Income Statement
- [ ] API endpoints `/api/reports/balance-sheet`, `/api/reports/income-statement`
- [ ] Dashboard com gráficos (Recharts)

### Fase 5: TAX & COMPLIANCE (Semana 9-10)
- [ ] `TaxRecord` model
- [ ] Cálculo automático de ICMS, PIS, COFINS
- [ ] Export SPED (Sistema Público de Escrituração Digital)

---

## 🚨 VALIDAÇÕES CRÍTICAS

### Double-Entry Validation
```typescript
function validateJournalEntry(entry: JournalEntry): boolean {
  const debits = entry.lineItems
    .filter(l => l.type === 'DEBIT')
    .reduce((sum, l) => sum + l.amountCents, 0);
  
  const credits = entry.lineItems
    .filter(l => l.type === 'CREDIT')
    .reduce((sum, l) => sum + l.amountCents, 0);
  
  if (debits !== credits) {
    throw new Error(`Unbalanced entry: debits=${debits}, credits=${credits}`);
  }
  
  return true;
}
```

### Balance Sheet Equation
```typescript
// Assets = Liabilities + Equity
function validateBalanceSheet(merchantId: string): boolean {
  const assets = sumAccountsByType(merchantId, 'ASSET');
  const liabilities = sumAccountsByType(merchantId, 'LIABILITY');
  const equity = sumAccountsByType(merchantId, 'EQUITY');
  
  return assets === liabilities + equity;
}
```

---

## 📚 REFERÊNCIAS

- **Brazilian GAAP**: Plano de Contas Referencial (CFC)
- **SPED**: [sped.rfb.gov.br](http://sped.rfb.gov.br/)
- **Double-Entry Bookkeeping**: Luca Pacioli, 1494
- **Stripe Payouts**: [stripe.com/docs/payouts](https://stripe.com/docs/payouts)
- **OFX Format**: Open Financial Exchange

---

## ✅ BENEFÍCIOS DO LEDGER COMPLETO

1. **Compliance**: SPED, auditorias fiscais
2. **Visibilidade**: DRE, Balanço, DFC em tempo real
3. **Reconciliação**: Match automático banco x sistema
4. **Multi-gateway**: Unifica Stripe, Pagarme, Appmax em um único GL
5. **Auditoria**: Trail completo de todos os movimentos financeiros
6. **Analytics**: Margem, COGS, EBITDA, Burn Rate
7. **Forecasting**: Projeções baseadas em histórico contábil

---

**Status**: 📝 Documento de especificação - Implementação pendente
**Próximo passo**: Aprovar arquitetura e criar migrations para Fase 1
