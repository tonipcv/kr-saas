'use client';

import Image from 'next/image';
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-white text-gray-900 dark:bg-black dark:text-gray-100">
      <div className="flex flex-col items-center gap-6 text-center px-6">
        {/* Top logo */}
        <div className="h-12 flex items-center" aria-hidden>
          <Image src="/logo.png" alt="Zuzuvu" width={40} height={10} className="opacity-80 dark:invert" />
        </div>

        <h1 className="text-xl font-semibold">The page you’re looking for doesn’t exist.</h1>

        <div className="text-sm opacity-80">
          Want this to be your username?{' '}
          <a
            className="underline decoration-1 underline-offset-2 hover:opacity-90"
            href="https://zuzu.vu"
            target="_blank"
            rel="noopener noreferrer"
          >
            Create your business page on Zuzu
          </a>
        </div>

        <Link
          href="/"
          className="text-xs rounded-full px-3 py-1 border border-current/20 hover:bg-black/5 dark:hover:bg-white/5 transition"
        >
          Go to homepage
        </Link>

      
      </div>
    </main>
  );
}
