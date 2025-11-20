#!/usr/bin/env node
/*
 * Run Prisma validate + generate to apply schema mapping changes.
 * - Validates schema (catch mapping errors early)
 * - Generates Prisma Client (@prisma/client)
 */

const { spawn } = require('child_process')

async function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts })
    p.on('close', (code) => {
      if (code === 0) return resolve()
      reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`))
    })
  })
}

(async () => {
  try {
    console.log('[prisma] validate...')
    await run('npx', ['-y', 'prisma', 'validate'])

    console.log('[prisma] generate...')
    await run('npx', ['-y', 'prisma', 'generate'])

    console.log('\n✅ Prisma validate + generate completed successfully.')
    console.log('   - Schema mappings applied (e.g., customer_providers.customer_id)')
    console.log('   - You can re-run your Appmax checkout flow now.')
  } catch (err) {
    console.error('\n❌ Prisma command failed:', err && err.message ? err.message : err)
    process.exit(1)
  }
})()
