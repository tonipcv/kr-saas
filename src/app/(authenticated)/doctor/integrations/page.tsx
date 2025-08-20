'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { CogIcon, LinkIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useSubscription } from '@/hooks/useSubscription';

export default function IntegrationsPage() {
  const { loading, subscriptionStatus } = useSubscription();
  const planName = subscriptionStatus?.planName || '';
  const isFree = useMemo(() => planName.toLowerCase() === 'free', [planName]);
  const isCreator = useMemo(() => planName.toLowerCase() === 'creator', [planName]);
  const blocked = useMemo(() => !isCreator, [isCreator]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="lg:ml-64">
          <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
            {/* Header Skeleton */}
            <div className="flex justify-between items-start mb-8">
              <div>
                <div className="h-8 bg-gray-200 rounded-lg w-32 mb-2 animate-pulse"></div>
                <div className="h-5 bg-gray-100 rounded-lg w-64 animate-pulse"></div>
              </div>
              <div className="h-10 bg-gray-200 rounded-xl w-32 animate-pulse"></div>
            </div>

            {/* Cards Skeleton */}
            <div className="grid gap-6 md:grid-cols-2">
              {[1, 2].map((i) => (
                <Card key={i} className="bg-white border-gray-200 shadow-lg rounded-2xl">
                  <CardHeader className="pb-4">
                    <div className="h-6 bg-gray-200 rounded-lg w-2/3 animate-pulse"></div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="h-4 bg-gray-100 rounded w-full animate-pulse"></div>
                    <div className="h-4 bg-gray-100 rounded w-2/3 animate-pulse"></div>
                    <div className="flex items-center gap-2 pt-2">
                      <div className="h-9 bg-gray-100 rounded-xl w-36 animate-pulse"></div>
                      <div className="h-9 bg-gray-100 rounded-xl w-28 animate-pulse"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
          {/* Header */}
          <div className="flex justify-between items-start mb-8">
            <div>
              <h1 className="text-xl font-semibold text-gray-900 mb-1">Integrations</h1>
              <p className="text-sm text-gray-500">Connect external tools and services</p>
            </div>
          </div>

          {/* Free plan banner */}
          {isFree && (
            <div className="mb-4 rounded-2xl px-4 py-4 text-white bg-gradient-to-r from-[#5893ec] to-[#9bcef7] shadow-sm">
              <p className="text-sm font-semibold">You're on the Free plan — Integrations are limited.</p>
              <p className="text-xs mt-1 opacity-95">Upgrade to the Creator plan to unlock full integrations and automations.</p>
              <div className="mt-3">
                <Link href="/clinic/subscription">
                  <Button size="sm" variant="secondary" className="h-8 rounded-lg bg-white text-gray-800 hover:bg-gray-100">
                    See plans
                  </Button>
                </Link>
              </div>
            </div>
          )}

          {/* Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Stripe */}
            <Card className="relative bg-white border border-gray-200 rounded-xl hover:border-gray-300 transition">
              {blocked && (
                <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-600 px-2 py-1 text-xs">
                  <LockClosedIcon className="h-3.5 w-3.5" /> Locked
                </div>
              )}
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
                    <CogIcon className="h-5 w-5 text-gray-500" /> Payments (Stripe)
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-sm">
                  <div className={blocked ? 'opacity-50 blur-[1px] select-none pointer-events-none' : ''}>
                    <p className="text-gray-600">
                      Enable online payments for your services by connecting a Stripe account.
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      {/* Keep learn more inside blurred block so it appears disabled when blocked */}
                      <a
                        href="https://stripe.com/"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
                      >
                        <LinkIcon className="h-4 w-4" /> Learn more
                      </a>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    {isCreator ? (
                      <Link href="/doctor/payments">
                        <Button className="bg-gradient-to-r from-[#5893ec] to-[#9bcef7] hover:opacity-90 text-white rounded-xl h-9 px-4 font-medium">
                          Open payment setup
                        </Button>
                      </Link>
                    ) : (
                      <Link href="/clinic/subscription">
                        <Button variant="outline" className="border-gray-200 bg-white text-gray-700 hover:bg-gray-50 rounded-lg h-9 px-4">
                          Upgrade to Creator
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Webhooks */}
            <Card className="relative bg-white border border-gray-200 rounded-xl hover:border-gray-300 transition">
              {blocked && (
                <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-600 px-2 py-1 text-xs">
                  <LockClosedIcon className="h-3.5 w-3.5" /> Locked
                </div>
              )}
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
                    <LinkIcon className="h-5 w-5 text-gray-500" /> Webhooks & Automations
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-sm">
                  <div className={blocked ? 'opacity-50 blur-[1px] select-none pointer-events-none space-y-4' : 'space-y-4'}>
                    <p className="text-gray-600">
                      Use webhooks to connect with automation platforms (Zapier, Make, n8n) or your own systems.
                    </p>
                    <div className="space-y-2">
                      <p className="text-gray-700 font-medium">Common events:</p>
                      <ul className="list-disc list-inside text-gray-600">
                        <li>New referral received</li>
                        <li>Service purchased</li>
                        <li>Patient assigned to protocol</li>
                      </ul>
                    </div>
                    <Separator />
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        className="border-gray-200 bg-white text-gray-700 hover:bg-gray-50 rounded-lg h-9 px-4"
                      >
                        View docs
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isCreator ? (
                      <Button className="bg-gradient-to-r from-[#5893ec] to-[#9bcef7] hover:opacity-90 text-white rounded-xl h-9 px-4 font-medium">
                        Create webhook
                      </Button>
                    ) : (
                      <Link href="/clinic/subscription">
                        <Button variant="outline" className="border-gray-200 bg-white text-gray-700 hover:bg-gray-50 rounded-lg h-9 px-4">
                          Upgrade to Creator
                        </Button>
                      </Link>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">Need a custom integration? Contact support.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
