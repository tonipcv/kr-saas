/*
  Delete specific PaymentTransaction rows by id and detach any CheckoutSession referencing them.
  Usage: node scripts/delete-payments.js
*/

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({ log: ['warn', 'error'] });

const IDS = [
  'PlFQhcXBOujPno0yUlMocUcEBsIWaRn2B4SvRL7Q2IBVE9mGFzoEomQeQNZOGxqFshTDfnuhthisZGS2MnUdnp85yNyh08XSZmDk:j7jqtc2lv907lgtc598kgsnp',
  'QPK5jzOThzrezj79eD0xQJnx8Wk1hvZrsVD0awxkTn3vUIwREXQvyQiC5y3Dw9X1wB5y9hA7f2u9adJRfLX4EIBYbKZLLSEv81Fi:j7jqtc2lv907lgtc598kgsnp',
  'QEK5g0PzHkBzNNMIpl2kQ3xly4iECwmTOXGJfCDEy3syU7haiOpHmydnUU302IwLw6qUnBFLi6l4RWiaTJPamJ5AS2ThJmw3xpFA:j7jqtc2lv907lgtc598kgsnp',
  'n0ZN51gcsA464lqGys9ViY4K4IowrZxqmxRGowkr4HZ5ejqARYgCkH50cT4vhird2NSB7tcugWtJywYw7oX1xk3BUSXSNOD2chFO:j7jqtc2lv907lgtc598kgsnp',
  'dCYnrhb2IP4Mzo24a3k8uabbjCqoTorSAMpJJnztvbY3DTncsKisTZRFJWo8U9sAnLAk0i9895PjumJuglA92gw3FoSEbVflSTas:j7jqtc2lv907lgtc598kgsnp',
  'QkKGOYtaXRUPdLNNtisCno0GVvC7cTG2kibYOYktYef1BmuGtPaIzE7Kbmj2eSWef30nA9qIpXVRH0WWEeNKrIgOFMYhmxtGJVVd:j7jqtc2lv907lgtc598kgsnp',
  'IdjJMV7I7tYGeAsc2hE8uzdp5t6QXmq9oYMDRU8FzBLv2UJm41HGglmpRCSvepl415F04m5QdCZyf7OfVhpn8QS54dDSJsK3UyJa:j7jqtc2lv907lgtc598kgsnp',
  'jZ3r3PQMxKAvHb93nbMUGkLBJ6vCI5YTvszFz5Vl0vZBmEHE8etjC60ckYbpvUzoS0gH8jRibdmnI6ZjAcrhT6P9TRGIUtPM1bvb:j7jqtc2lv907lgtc598kgsnp',
  'gstK3DGOicpSosaR3xWgDRHPZe5V77BJUuNCG9wypW0mvHMg1ngHywI5rf6I78keUtLmBbQLJ1heEqhxbs8v66C1xqcwPIC3GS9W:j7jqtc2lv907lgtc598kgsnp',
  'qSLHIoxhrmSQBXGU2WGleTODPES8uy2eVEl8DuXranaC5RLFFuZXsEVwUhIA11D5FySBXu7QRN7vYAMuLBhpl7KQUqKDFi98z5J7:j7jqtc2lv907lgtc598kgsnp',
  'i126LqoVs2pUiUJ6NW7MBpCXgZ3JtwSd7m5tz6xaMIwoGA1Zi26SGGDMV3gKqy7Ul6zHdKbtIt1liA4jOzQGAGPfGGNFvCp9wbJ3:j7jqtc2lv907lgtc598kgsnp',
  'NttGeLTA2j8906Y1cfj9uvo81ZZdZL1qn9PpsUgN9x7OSmyGF2y1t7TDxM1oLAKMKvbt9mPkntYONvog4N4neZ5Sk7aGTvRRh7J5:j7jqtc2lv907lgtc598kgsnp',
  'uAZmcR0mpLtHHdPX5y8I4WyJf0Xv3YjlvM6nGhmMpon9OmbLpqsKOtAkl6UAhOlBkek9mBtiprz9xsMgWb8Wgp9l791S2QKtFGFA:j7jqtc2lv907lgtc598kgsnp',
  'g1Gx8lJn9ooHBcOIalK8cmu4wxZI2bFXWhpWuiCQa6xSddpBtaoOra5N5myoryPxzBgWqkdQVLZZAdIhIJ6zHKcmbwqpIVQ5wNMk:j7jqtc2lv907lgtc598kgsnp',
  'VRk2dxyqprsoGCOV0kJW9kI8oQwJng6HeZCQ2RQEJCUBTyv4g3LJ4NsC9UVpujLeRNWfB7jKkrS2zWhD2Xs6gExG2Yff8fbyE8jv:j7jqtc2lv907lgtc598kgsnp'
];

async function main() {
  console.log('[cleanup] Starting deletion for', IDS.length, 'payment_transactions');

  // Preview
  const preview = await prisma.paymentTransaction.findMany({
    where: { id: { in: IDS } },
    select: { id: true, status: true, createdAt: true }
  });
  console.log('[cleanup] Preview count:', preview.length);

  // Detach checkout sessions that may reference these transactions
  const detach = await prisma.checkoutSession.updateMany({
    where: { paymentTransactionId: { in: IDS } },
    data: { paymentTransactionId: null }
  });
  console.log('[cleanup] Checkout sessions detached:', detach.count);

  // Delete transactions
  const del = await prisma.paymentTransaction.deleteMany({
    where: { id: { in: IDS } }
  });
  console.log('[cleanup] Deleted payment_transactions:', del.count);
}

main()
  .catch((e) => { console.error('[cleanup] Error:', e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); console.log('[cleanup] Done.'); });
