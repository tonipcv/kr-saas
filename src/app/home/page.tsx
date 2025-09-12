import Link from 'next/link';
import Image from 'next/image';
import ReferralStepper from '@/components/ReferralStepper';
import TestimonialsCarousel from '@/components/TestimonialsCarousel';
import LogosMarquee from '@/components/LogosMarquee';

export default function PublicHome() {
  const testimonials = [
    {
      quote:
        'We launched patient referrals in a weekend and doubled booked consultations in 30 days. Attribution is crystal clear.',
      name: 'Dr. Daniel Brooks',
      title: 'Chief Medical Officer',
      company: 'Bella Vida Clinic',
      avatar: '/dep31.avif',
      highlight: true,
    },
    {
      quote:
        'Points for check-ins and purchases boosted retention. Our patients love redeeming for labs and supplements.',
      name: 'Emily Carter',
      title: 'Operations Lead',
      company: 'Vita Labs',
      avatar: '/dep32.avif',
    },
    {
      quote:
        'Creators finally have unique links and fair payouts. The rewards codes keep campaigns fresh and measurable.',
      name: 'Michael Harris',
      title: 'Head of Creator Partnerships',
      company: 'HealthHub',
      avatar: '/dep33.avif',
    },
    {
      quote:
        'From setup to scale in days. One place for referrals, points and coupon codes—our growth team’s new home.',
      name: 'Olivia Johnson',
      title: 'Head of Growth',
      company: 'Wellness Pro',
      avatar: '/dep34.avif',
    },
  ];
  return (
    <main className="min-h-screen bg-white flex flex-col">
      {/* Promo banner (top) */}
      <section className="relative overflow-hidden">
        <div className="bg-gradient-to-r from-[#6d28d9] via-[#7c3aed] to-[#8b5cf6]">
          <div className="relative">
            {/* Wave texture (SVG lines) */}
            <svg className="pointer-events-none absolute inset-0 opacity-30" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 200" preserveAspectRatio="none">
              <defs>
                <linearGradient id="g" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="0.1" />
                </linearGradient>
              </defs>
              {Array.from({ length: 12 }).map((_, i) => (
                <path key={i} d={`M0 ${10 + i*15} C 300 ${-20 + i*18}, 900 ${40 + i*12}, 1200 ${10 + i*15}`} fill="none" stroke="url(#g)" strokeWidth="2" />
              ))}
            </svg>
            <div className="relative z-10">
              <div className="max-w-7xl mx-auto px-4">
                <div className="py-2.5 md:py-3">
                  <div className="mx-auto flex items-center justify-center gap-3 flex-wrap">
                    <span className="text-xs md:text-sm font-medium text-white text-center">
                      Celebrating 1,000+ happy customers and $100M+ in added revenue. Enjoy 14 days free!
                    </span>
                    <Link
                      href="/auth/register/email-14"
                      className="inline-flex items-center px-3 py-1 rounded-full text-[11px] md:text-xs font-semibold bg-white text-gray-900 hover:opacity-90 shadow-sm"
                    >
                      Try now
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* Top bar (minimal) */}
      <header className="w-full">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="relative w-8 h-8">
              <Image src="/logo.png" alt="Logo" fill className="object-contain" priority />
            </div>
          </div>
          <nav className="flex items-center gap-4">
            <Link href="/auth/signin" className="text-gray-900 text-sm md:text-base font-medium hover:text-gray-700">
              Sign in
            </Link>
            <Link
              href="/auth/register"
              className="hidden sm:inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-white text-sm font-semibold bg-gradient-to-b from-gray-900 to-black shadow-sm hover:opacity-90"
            >
              Get started
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="h-4 w-4 opacity-80">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero (expanded, centered) */}
      <section className="relative overflow-hidden">
        {/* Soft blue glow background */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-16 -left-24 h-80 w-80 rounded-full bg-[#eaf2ff] blur-3xl opacity-70" />
          <div className="absolute top-32 -right-24 h-96 w-96 rounded-full bg-[#eef4ff] blur-3xl opacity-70" />
        </div>
        <div className="max-w-7xl mx-auto px-4 py-36 md:py-48">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl md:text-7xl font-extrabold tracking-tight leading-tight bg-gradient-to-b from-[#2d3238] to-[#545860] bg-clip-text text-transparent motion-safe:animate-fade-up">
              Grow with Rewards
            </h1>
            <p className="hidden sm:block mt-5 md:mt-6 text-gray-600 text-base md:text-2xl max-w-3xl mx-auto motion-safe:animate-fade-up [animation-delay:120ms]">
              Launch referrals, reward points, and redeemable codes in minutes. Simple, minimal, and built to scale.
            </p>
            <div className="mt-10 md:mt-12 flex items-center justify-center gap-4 motion-safe:animate-fade-up [animation-delay:240ms]">
              <Link href="/auth/signin" className="text-gray-900 text-base md:text-lg font-medium hover:text-gray-700">
                Sign in
              </Link>
              <Link
                href="/auth/register"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-white text-sm md:text-base font-semibold bg-gradient-to-b from-gray-900 to-black shadow-sm hover:opacity-90"
              >
                Get started
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="h-4 w-4 opacity-80">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>

            {/* Mobile-only: single five-star row under button */}
            <div className="mt-8 sm:hidden flex items-center justify-center gap-1 text-gray-700">
              {Array.from({ length: 5 }).map((_, i) => (
                <svg key={i} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.802 2.036a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.802-2.036a1 1 0 00-1.176 0l-2.802 2.036c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.462a1 1 0 00.95-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>

            {/* Ratings strip under buttons (no scroll on mobile; ratings only) */}
            <div className="mt-10 md:mt-12 flex items-center justify-center gap-6 text-gray-700 text-xs md:text-sm">
              {/* G2 rating */}
              <div className="inline-flex items-center gap-2">
                <span className="inline-flex items-center justify-center h-4 w-4 md:h-5 md:w-5 rounded-[4px] bg-gray-100 ring-1 ring-gray-200 text-[9px] md:text-[10px] font-bold">G2</span>
                <div className="hidden md:flex items-center gap-1 text-gray-500">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <svg key={i} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.802 2.036a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.802-2.036a1 1 0 00-1.176 0l-2.802 2.036c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.462a1 1 0 00.95-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <span>4.9 rating</span>
              </div>

              {/* OMR rating */}
              <div className="inline-flex items-center gap-2">
                <span className="inline-flex items-center justify-center h-4 px-1.5 md:h-5 md:px-2 rounded-[4px] bg-gray-100 ring-1 ring-gray-200 text-[9px] md:text-[10px] font-bold">OMR</span>
                <div className="hidden md:flex items-center gap-1 text-gray-500">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <svg key={i} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.802 2.036a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.802-2.036a1 1 0 00-1.176 0l-2.802 2.036c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.462a1 1 0 00.95-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <span>4.8 rating</span>
              </div>
            </div>

            
          </div>
        </div>
      </section>

      {/* Used by logos (below hero) */}
      <section className="py-10 md:py-12 bg-gradient-to-b from-white to-[rgba(250,250,255,0.6)]">
        <div className="max-w-7xl mx-auto px-4">
          <h4 className="text-center text-sm md:text-base font-medium text-gray-800">
            Used daily by more than 6,000 small and large businesses.
          </h4>
          <div className="mt-6">
            <LogosMarquee logos={['/logos/1.png','/logos/2.png','/logos/3.png','/logos/4.png','/logos/5.png','/logos/6.png','/logos/7.png','/logos/8.png','/logos/9.png','/logos/10.png','/logos/11.png']} />
          </div>
        </div>
      </section>

      {/* Feature list (professional) */}
      <section className="py-20 md:py-32 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center">
            <div className="hidden sm:inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-gray-200 text-gray-600 bg-white">Product</div>
            <h2 className="mt-2 text-2xl md:text-4xl font-extrabold text-gray-900">Rewards done right.</h2>
            <p className="hidden sm:block mt-2 md:mt-3 text-gray-600 max-w-2xl mx-auto text-sm md:text-base">
              Build Referral, Points, and Rewards Code programs in one place — simple to configure, easy to scale.
            </p>
          </div>

          <div className="mt-8 md:mt-12 grid md:grid-cols-3 gap-4 md:gap-6">
            {/* Referrals */}
            <div className="rounded-xl md:rounded-2xl p-5 md:p-7 bg-white ring-1 ring-gray-200 shadow-sm">
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] md:text-[11px] font-medium ring-1 ring-gray-200 text-gray-600 bg-white">01</span>
              <h3 className="mt-3 text-base md:text-lg font-semibold text-gray-900 tracking-tight">Referrals</h3>
              <p className="hidden sm:block mt-2 text-sm text-gray-600">Track invites, conversions, and rewards with clear attribution.</p>
              <ul className="mt-3 space-y-1.5 text-sm text-gray-600 list-disc list-inside">
                <li>Unique links per creator or customer</li>
                <li>Flexible conversion events</li>
              </ul>
            </div>

            {/* Points */}
            <div className="rounded-xl md:rounded-2xl p-5 md:p-7 bg-white ring-1 ring-gray-200 shadow-sm">
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] md:text-[11px] font-medium ring-1 ring-gray-200 text-gray-600 bg-white">02</span>
              <h3 className="mt-3 text-base md:text-lg font-semibold text-gray-900 tracking-tight">Points</h3>
              <p className="hidden sm:block mt-2 text-sm text-gray-600">Award points for actions and allow redemptions with rules.</p>
              <ul className="mt-3 space-y-1.5 text-sm text-gray-600 list-disc list-inside">
                <li>Any action → points mapping</li>
                <li>Redeem with guardrails</li>
              </ul>
            </div>

            {/* Rewards Codes */}
            <div className="rounded-xl md:rounded-2xl p-5 md:p-7 bg-white ring-1 ring-gray-200 shadow-sm">
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] md:text-[11px] font-medium ring-1 ring-gray-200 text-gray-600 bg-white">03</span>
              <h3 className="mt-3 text-base md:text-lg font-semibold text-gray-900 tracking-tight">Rewards Codes</h3>
              <p className="hidden sm:block mt-2 text-sm text-gray-600">Generate unique codes and control redemption limits.</p>
              <ul className="mt-3 space-y-1.5 text-sm text-gray-600 list-disc list-inside">
                <li>Single-use or multi-use</li>
                <li>Expiry and redemption caps</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials (social proof) */}
      <section className="py-20 md:py-28 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto">
            <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-gray-200 text-gray-700 bg-white">Testimonials</span>
            <h2 className="mt-3 text-3xl md:text-5xl font-extrabold text-gray-900 tracking-tight">Don’t just take our word for it</h2>
            <p className="mt-3 text-gray-600 text-sm md:text-base">Our users are our best ambassadors. See why teams choose Zuzz to run rewards and referrals.</p>
          </div>
          <TestimonialsCarousel items={testimonials} />
        </div>
      </section>

      {/* Free trial simple timeline (under testimonials) */}
      <section className="py-20 md:py-24 border-t border-gray-100">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-5xl font-extrabold text-gray-900 tracking-tight">Your Free Trial, Made Easy</h2>
          <p className="mt-3 text-gray-600 text-sm md:text-base">Try Zuzz risk-free for 14 days. Get full access to all features. No commitment — cancel anytime.</p>

          {/* Timeline */}
          <div className="mt-10 md:mt-12">
            <div className="relative mx-auto max-w-3xl">
              {/* line */}
              <div className="absolute left-0 right-0 top-4 h-1 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-600 rounded-full opacity-20" />
              <div className="relative grid grid-cols-3 gap-6">
                {/* Today */}
                <div className="flex flex-col items-center">
                  <div className="h-8 w-8 rounded-full bg-white ring-2 ring-gray-300 flex items-center justify-center text-gray-900">
                    {/* minimal cloud icon */}
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                      <path d="M7 18a4 4 0 010-8c.2 0 .39.01.58.04A5 5 0 0118 9a3 3 0 010 6H7z" />
                    </svg>
                  </div>
                  <div className="mt-4 text-sm md:text-base font-semibold text-gray-900">Today</div>
                  <p className="mt-1 text-xs md:text-sm text-gray-600">Access the platform instantly. Launch referrals & points in minutes.</p>
                </div>
                {/* Day 7 */}
                <div className="flex flex-col items-center">
                  <div className="h-8 w-8 rounded-full bg-white ring-2 ring-gray-300 flex items-center justify-center text-gray-900">
                    {/* minimal bell icon */}
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                      <path d="M12 22a2 2 0 002-2H10a2 2 0 002 2z" />
                      <path d="M18 16v-5a6 6 0 10-12 0v5l-2 2h16l-2-2z" />
                    </svg>
                  </div>
                  <div className="mt-4 text-sm md:text-base font-semibold text-gray-900">Day 7</div>
                  <p className="mt-1 text-xs md:text-sm text-gray-600">We’ll remind you about your trial status so you stay in control.</p>
                </div>
                {/* Day 14 */}
                <div className="flex flex-col items-center">
                  <div className="h-8 w-8 rounded-full bg-white ring-2 ring-gray-300 flex items-center justify-center text-gray-900">
                    {/* minimal star icon */}
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                    </svg>
                  </div>
                  <div className="mt-4 text-sm md:text-base font-semibold text-gray-900">Day 14</div>
                  <p className="mt-1 text-xs md:text-sm text-gray-600">Start subscription. Cancel or upgrade anytime.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <Link href="/auth/register" className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-white text-sm md:text-base font-semibold bg-gradient-to-b from-gray-900 to-black hover:opacity-90 shadow-sm">
              Start my 14-day free trial
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* Referrals stepper */}
      <ReferralStepper />

      {/* CTA (refined) */}
      <section className="py-24 md:py-32 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4">
          <div className="rounded-2xl p-6 md:p-10 bg-white ring-1 ring-gray-200 text-center">
            <h3 className="text-xl md:text-3xl font-extrabold text-gray-900">Launch your rewards in minutes</h3>
            <p className="mt-2 text-gray-600 text-sm md:text-base">Referrals, points, and codes — one setup, built to scale.</p>
            <div className="mt-6">
              <Link href="/auth/register" className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-white text-sm md:text-base font-semibold bg-gradient-to-b from-gray-900 to-black shadow-sm hover:opacity-90">
                Get started
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="h-4 w-4 opacity-80">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
            {/* Mobile-only: single five-star row under CTA button */}
            <div className="mt-8 sm:hidden flex items-center justify-center gap-1 text-gray-700">
              {Array.from({ length: 5 }).map((_, i) => (
                <svg key={`cta-star-${i}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.802 2.036a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.802-2.036a1 1 0 00-1.176 0l-2.802 2.036c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.462a1 1 0 00.95-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>
            {/* Ratings strip under CTA (no scroll on mobile; ratings only) */}
            <div className="mt-10 md:mt-12 flex items-center justify-center gap-6 text-gray-700 text-xs md:text-sm">
              {/* G2 rating */}
              <div className="inline-flex items-center gap-2">
                <span className="inline-flex items-center justify-center h-4 w-4 md:h-5 md:w-5 rounded-[4px] bg-gray-100 ring-1 ring-gray-200 text-[9px] md:text-[10px] font-bold">G2</span>
                <div className="hidden md:flex items-center gap-1 text-gray-500">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <svg key={i} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.802 2.036a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.802-2.036a1 1 0 00-1.176 0l-2.802 2.036c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.462a1 1 0 00.95-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <span>4.9 rating</span>
              </div>

              {/* OMR rating */}
              <div className="inline-flex items-center gap-2">
                <span className="inline-flex items-center justify-center h-4 px-1.5 md:h-5 md:px-2 rounded-[4px] bg-gray-100 ring-1 ring-gray-200 text-[9px] md:text-[10px] font-bold">OMR</span>
                <div className="hidden md:flex items-center gap-1 text-gray-500">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <svg key={i} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.802 2.036a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.802-2.036a1 1 0 00-1.176 0l-2.802 2.036c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.462a1 1 0 00.95-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <span>4.8 rating</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 py-10 grid md:grid-cols-5 gap-8 text-sm">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2">
              <div className="relative w-7 h-7">
                <Image src="/logo.png" alt="Logo" fill className="object-contain" />
              </div>
            </div>
            <p className="mt-3 text-gray-600">The simple way to run referrals, points, and rewards codes.</p>
          </div>
          {[
            { title: 'Product', links: ['Referrals', 'Points', 'Rewards Codes', 'Pricing'] },
            { title: 'Resources', links: ['Integrations', 'Support', 'Docs'] },
            { title: 'Company', links: ['About', 'Privacy', 'Terms'] },
          ].map((col, i) => (
            <div key={i}>
              <h6 className="font-semibold text-gray-900">{col.title}</h6>
              <ul className="mt-3 space-y-2 text-gray-600">
                {col.links.map((l) => (
                  <li key={l}><a className="hover:text-gray-900" href="#">{l}</a></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-100 py-6 text-xs text-gray-500">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-center sm:text-left w-full sm:w-auto">
              © {new Date().getFullYear()} Zuzz Rewards. All rights reserved.
            </div>
            <div className="flex items-center gap-4 sm:gap-6">
              <div className="relative h-12 w-20 sm:h-14 sm:w-24 md:h-16 md:w-28">
                <Image src="/62c85f30dfdd6b544f3cfbf7_gdpr.webp" alt="GDPR" fill className="object-contain" />
              </div>
              <div className="relative h-12 w-20 sm:h-14 sm:w-24 md:h-16 md:w-28">
                <Image src="/6495d2ed50590116fbd4e99c_climate_active.webp" alt="Climate Active" fill className="object-contain" />
              </div>
              <div className="relative h-12 w-20 sm:h-14 sm:w-24 md:h-16 md:w-28">
                <Image src="/62257b4bcd0f0b08e9b93658_remote-company.webp" alt="Remote Company" fill className="object-contain" />
              </div>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}

