#!/usr/bin/env node
/*
Simple Node tester to POST to our enrollments API.
Requires the Next.js app running locally (default http://localhost:3000).
Usage:
  BASE_URL=http://localhost:3000 node local-scripts/test_enrollment_post.js
*/

const base = process.env.BASE_URL || 'http://localhost:3000';

async function main() {
  const externalId = (global.crypto?.randomUUID?.() || require('crypto').randomUUID());
  const deviceName = 'NodeScript/EnrollmentTester';
  const document = process.env.TEST_CPF || '76109277673'; // override with TEST_CPF

  const body = {
    // If LINAOB_REDIRECT_URI is set on the server, it will override this
    redirectUri: process.env.TEST_REDIRECT_URI || 'https://redirect-demo-opal.vercel.app',
    // You may optionally force org/auth IDs; otherwise route may retry with env pair
    // organisationId: process.env.TEST_ORG_ID,
    // authorisationServerId: process.env.TEST_AUTH_ID,
    enrollment: {
      document,
      deviceName,
      externalId,
    },
    riskSignals: {
      deviceId: externalId,
      osVersion: '14',
      userTimeZoneOffset: '-03',
      language: 'en',
      screenDimensions: { width: 1788, height: 1037 },
      accountTenure: '2024-11-18',
      isRootedDevice: false,
      elapsedTimeSinceBoot: 12000,
      screenBrightness: 1,
    },
    context: {
      productId: process.env.TEST_PRODUCT_ID || 'j7jqtc2lv907lgtc598kgsnp',
      amountCents: Number(process.env.TEST_AMOUNT_CENTS || 99700),
      currency: 'BRL',
      orderRef: externalId,
    },
  };

  const url = `${base.replace(/\/$/, '')}/api/open-finance/enrollments`;
  console.log('[tester] POST', url);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }

  console.log('[tester] status =', res.status);
  if (json) {
    console.log('[tester] json =', JSON.stringify(json, null, 2));
  } else {
    console.log('[tester] text =', text);
  }
}

main().catch((e) => {
  console.error('[tester] error:', e);
  process.exit(1);
});
