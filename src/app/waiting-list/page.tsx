'use client';

import Image from 'next/image';
import { signOut } from 'next-auth/react';

export default function WaitingListPage() {
  return (
    <main className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        {/* Logo */}
        <div className="mx-auto mb-6 relative w-10 h-10">
          <Image src="/logo.png" alt="Logo" fill className="object-contain" priority />
        </div>

        <h1 className="text-xl font-semibold text-gray-900">You’re on the waiting list</h1>
        <p className="mt-2 text-sm text-gray-600">
          Thanks for signing up. We’ll notify you by email and phone when it’s time to finalize your account setup.
        </p>

        <p className="mt-6 text-sm text-gray-700">
          Any questions? Email <a href="mailto:toni@krxlab.com" className="underline hover:no-underline">toni@krxlab.com</a>
        </p>

        <div className="mt-6">
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Sign out
          </button>
        </div>
      </div>
    </main>
  );
}
