#!/usr/bin/env node
/*
  Idempotent schema extender for payment orchestration (B2B2C)
  - Adds models: Customer, CustomerProvider, CustomerPaymentMethod, CustomerSubscription
  - Extends PaymentTransaction with optional FKs and billing period fields
  - Avoids duplicates; only appends if missing
*/

const fs = require('fs');
const path = require('path');

const schemaPath = path.resolve(process.cwd(), 'prisma', 'schema.prisma');
if (!fs.existsSync(schemaPath)) {
  console.error('[error] prisma/schema.prisma not found at', schemaPath);
  process.exit(1);
}

let schema = fs.readFileSync(schemaPath, 'utf8');

const hasModel = (name) => new RegExp(`(^|\n)\s*model\s+${name}\s*\{`, 'm').test(schema);
const insertBefore = (text, marker) => {
  const idx = schema.lastIndexOf(marker);
  if (idx === -1) {
    schema += `\n\n${text}\n`;
  } else {
    schema = schema.slice(0, idx) + `\n\n${text}\n\n` + schema.slice(idx);
  }
};

// Snippets
const customerModel = `model Customer {
  id         String   @id @default(cuid())
  merchantId String
  name       String?
  email      String?
  phone      String?
  document   String?
  address    Json?
  metadata   Json?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  providers      CustomerProvider[]
  paymentMethods CustomerPaymentMethod[]

  @@index([merchantId, email])
  @@index([merchantId, phone])
  @@map("customers")
}`;

const customerProviderModel = `model CustomerProvider {
  id                 String   @id @default(cuid())
  customerId         String
  provider           PaymentProvider
  accountId          String?
  providerCustomerId String
  metadata           Json?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  customer Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)

  @@unique([provider, accountId, providerCustomerId])
  @@unique([customerId, provider, accountId])
  @@index([customerId, provider, accountId])
  @@map("customer_providers")
}`;

const customerPaymentMethodModel = `model CustomerPaymentMethod {
  id                      String   @id @default(cuid())
  customerId              String
  customerProviderId      String?
  provider                PaymentProvider
  accountId               String?
  providerPaymentMethodId String?
  brand                   String?
  last4                   String?
  expMonth                Int?
  expYear                 Int?
  isDefault               Boolean  @default(false)
  status                  String?
  fingerprint             String?
  metadata                Json?
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt

  customer         Customer         @relation(fields: [customerId], references: [id], onDelete: Cascade)
  customerProvider CustomerProvider? @relation(fields: [customerProviderId], references: [id])

  @@unique([provider, accountId, providerPaymentMethodId])
  @@index([customerId, provider, accountId])
  @@map("customer_payment_methods")
}`;

const customerSubscriptionModel = `model CustomerSubscription {
  id                     String   @id @default(cuid())
  customerId             String
  merchantId             String
  productId              String
  offerId                String?
  provider               PaymentProvider
  accountId              String?
  isNative               Boolean  @default(true)
  customerProviderId     String?
  providerSubscriptionId String?
  vaultPaymentMethodId   String?
  status                 SubscriptionStatus @default(TRIAL)
  startAt                DateTime @default(now())
  trialEndsAt            DateTime?
  currentPeriodStart     DateTime?
  currentPeriodEnd       DateTime?
  cancelAt               DateTime?
  canceledAt             DateTime?
  priceCents             Int
  currency               Currency
  metadata               Json?
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt

  customer         Customer         @relation(fields: [customerId], references: [id], onDelete: Cascade)
  customerProvider CustomerProvider @relation(fields: [customerProviderId], references: [id])

  @@index([merchantId, status])
  @@index([provider, accountId, providerSubscriptionId])
  @@map("customer_subscriptions")
}`;

// Append models if missing
if (!hasModel('Customer')) insertBefore(customerModel, '\n// Removed enums: AppointmentStatus, ServiceAvailability, FeeType, FeeVisibility');
if (!hasModel('CustomerProvider')) insertBefore(customerProviderModel, '\n// Removed enums: AppointmentStatus, ServiceAvailability, FeeType, FeeVisibility');
if (!hasModel('CustomerPaymentMethod')) insertBefore(customerPaymentMethodModel, '\n// Removed enums: AppointmentStatus, ServiceAvailability, FeeType, FeeVisibility');
if (!hasModel('CustomerSubscription')) insertBefore(customerSubscriptionModel, '\n// Removed enums: AppointmentStatus, ServiceAvailability, FeeType, FeeVisibility');

// Extend PaymentTransaction with optional FKs and billing period fields
const ptModelStart = schema.indexOf('\nmodel PaymentTransaction');
if (ptModelStart !== -1) {
  // naive block capture with brace counting
  const braceStart = schema.indexOf('{', ptModelStart);
  let i = braceStart + 1, depth = 1;
  while (i < schema.length && depth > 0) {
    if (schema[i] === '{') depth++;
    else if (schema[i] === '}') depth--;
    i++;
  }
  const blockEnd = i; // position after closing brace
  const block = schema.slice(ptModelStart, blockEnd);

  const addLines = [];
  const needs = [
    { key: 'customerId', line: '  customerId            String?  @map("customer_id")' },
    { key: 'customerProviderId', line: '  customerProviderId    String?  @map("customer_provider_id")' },
    { key: 'customerPaymentMethodId', line: '  customerPaymentMethodId String?  @map("customer_payment_method_id")' },
    { key: 'customerSubscriptionId', line: '  customerSubscriptionId String?  @map("customer_subscription_id")' },
    { key: 'billingPeriodStart', line: '  billingPeriodStart    DateTime? @map("billing_period_start")' },
    { key: 'billingPeriodEnd', line: '  billingPeriodEnd      DateTime? @map("billing_period_end")' },
  ];
  for (const n of needs) {
    if (!new RegExp(`\n\s*${n.key}\s+`).test(block)) addLines.push(n.line);
  }

  if (addLines.length) {
    // insert before first @@index/@@map line inside the model
    const innerStart = braceStart + 1;
    const inner = schema.slice(innerStart, blockEnd - 1);
    const metaIdxRel = inner.search(/\n\s*@@(index|map|unique)/);
    const insertPos = metaIdxRel === -1 ? blockEnd - 1 : innerStart + metaIdxRel;
    const insertion = '\n' + addLines.join('\n') + '\n';
    schema = schema.slice(0, insertPos) + insertion + schema.slice(insertPos);
  }
}

fs.writeFileSync(schemaPath, schema, 'utf8');
console.log('[ok] Prisma schema extended (idempotent).');
