#!/usr/bin/env node
/**
 * Check helpers for Open Finance flow using Node.js (no browser required).
 *
 * Usage examples:
 *   node local-scripts/check_of_flow.js --return-to http://localhost:3000/krx/checkout/j7jqtc2lv907lgtc598kgsnp
 *   node local-scripts/check_of_flow.js --state <OAUTH_STATE_VALUE>
 */

const { URL } = require('node:url');
const process = require('node:process');

const BASE = process.env.BASE_URL || 'http://localhost:3000';

function parseArgs() {
  const out = { returnTo: null, state: null };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--return-to') {
      out.returnTo = argv[++i];
    } else if (a === '--state') {
      out.state = argv[++i];
    }
  }
  return out;
}

async function postReturnTo(url) {
  const res = await fetch(new URL('/api/v2/return-to', BASE), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const setCookie = res.headers.get('set-cookie');
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, setCookie, body: json };
}

async function getReturnTo(cookie) {
  const res = await fetch(new URL('/api/v2/return-to', BASE), {
    method: 'GET',
    headers: cookie ? { cookie } : {},
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: json };
}

async function getStateMeta(state) {
  const url = new URL('/api/v2/oauth/state-meta', BASE);
  url.searchParams.set('state', state);
  const res = await fetch(url.toString());
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: json };
}

(async () => {
  const { returnTo, state } = parseArgs();

  if (returnTo) {
    console.log('Posting return-to URL to server cookie:', returnTo);
    const post = await postReturnTo(returnTo);
    console.log('POST /api/v2/return-to →', { status: post.status, body: post.body });
    if (!post.ok) {
      process.exitCode = 1;
      return;
    }
    const cookie = post.setCookie;
    if (!cookie) {
      console.warn('No Set-Cookie header returned. Cannot verify cookie read.');
    } else {
      const get = await getReturnTo(cookie);
      console.log('GET /api/v2/return-to →', { status: get.status, body: get.body });
      if (get.body && get.body.url) {
        console.log('Server stored of_return_to =', get.body.url);
      } else {
        console.warn('Server did not return a stored URL.');
      }
    }
  }

  if (state) {
    console.log('Fetching state meta for state=', state);
    const meta = await getStateMeta(state);
    console.log('GET /api/v2/oauth/state-meta →', { status: meta.status, body: meta.body });
    if (meta.ok && (meta.body?.productId || meta.body?.organisationId)) {
      const pid = meta.body.productId;
      console.log('Derived productId =', pid);
      console.log('Suggested checkout path:', pid ? `/checkout/${pid}` : '(unknown, missing productId)');
    }
  }

  if (!returnTo && !state) {
    console.log('Usage:');
    console.log('  node local-scripts/check_of_flow.js --return-to <URL>');
    console.log('  node local-scripts/check_of_flow.js --state <OAUTH_STATE>');
  }
})();
