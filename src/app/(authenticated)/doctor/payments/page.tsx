'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from '@/components/ui/use-toast';
import { ArrowLeftIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface StripeAccount {
  id: string;
  details_submitted: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
}

export default function PaymentsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [stripeAccount, setStripeAccount] = useState<StripeAccount | null>(null);
  const [onboardingUrl, setOnboardingUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchStripeAccount();
  }, []);

  const fetchStripeAccount = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/v2/doctor/stripe-connect');
      if (!response.ok) {
        throw new Error('Failed to fetch Stripe account');
      }
      const data = await response.json();
      setStripeAccount(data.data || null);
    } catch (error) {
      console.error('Error fetching Stripe account:', error);
      toast({
        title: 'Error',
        description: 'Failed to load Stripe account information. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnectStripe = async () => {
    setIsConnecting(true);
    try {
      const response = await fetch('/api/v2/doctor/stripe-connect', {
        method: 'POST',
      });
      
      if (!response.ok) {
        throw new Error('Failed to create Stripe Connect account');
      }
      
      const data = await response.json();
      
      if (data.data?.onboarding_url) {
        setOnboardingUrl(data.data.onboarding_url);
        window.open(data.data.onboarding_url, '_blank');
      } else {
        throw new Error('No onboarding URL received');
      }
      
      // Refresh account data
      fetchStripeAccount();
    } catch (error) {
      console.error('Error connecting Stripe:', error);
      toast({
        title: 'Error',
        description: 'Failed to connect Stripe account. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnectStripe = async () => {
    if (!confirm('Are you sure you want to disconnect your Stripe account? This will affect your ability to receive payments for services.')) {
      return;
    }

    setIsDisconnecting(true);
    try {
      const response = await fetch('/api/v2/doctor/stripe-connect', {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to disconnect Stripe account');
      }
      
      toast({
        title: 'Success',
        description: 'Stripe account disconnected successfully.',
      });
      
      setStripeAccount(null);
    } catch (error) {
      console.error('Error disconnecting Stripe:', error);
      toast({
        title: 'Error',
        description: 'Failed to disconnect Stripe account. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center mb-6">
        <Link href="/doctor/services" className="mr-4">
          <Button variant="outline" size="icon">
            <ArrowLeftIcon className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">Payment Settings</h1>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Stripe Connect</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-10 w-40" />
            </div>
          ) : stripeAccount ? (
            <div className="space-y-6">
              <div className="flex items-center space-x-2">
                <div className="text-lg font-medium">Account Status</div>
                {stripeAccount.charges_enabled ? (
                  <Badge variant="success">Active</Badge>
                ) : (
                  <Badge variant="warning">Setup Incomplete</Badge>
                )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatusCard 
                  title="Account Details" 
                  isComplete={stripeAccount.details_submitted}
                  description={stripeAccount.details_submitted 
                    ? "Your account details have been submitted." 
                    : "Please complete your account details."}
                />
                
                <StatusCard 
                  title="Payments" 
                  isComplete={stripeAccount.charges_enabled}
                  description={stripeAccount.charges_enabled 
                    ? "You can accept payments." 
                    : "Payment acceptance not yet enabled."}
                />
                
                <StatusCard 
                  title="Payouts" 
                  isComplete={stripeAccount.payouts_enabled}
                  description={stripeAccount.payouts_enabled 
                    ? "You can receive payouts." 
                    : "Payouts not yet enabled."}
                />
              </div>
              
              {!stripeAccount.charges_enabled && (
                <Alert className="bg-blue-50 border-blue-200">
                  <AlertTitle>Complete your Stripe account setup</AlertTitle>
                  <AlertDescription>
                    You need to complete your Stripe account setup to start accepting payments.
                    {onboardingUrl && (
                      <div className="mt-2">
                        <a 
                          href={onboardingUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          Continue setup
                        </a>
                      </div>
                    )}
                    {!onboardingUrl && (
                      <div className="mt-2">
                        <Button 
                          variant="outline" 
                          onClick={handleConnectStripe}
                          disabled={isConnecting}
                        >
                          {isConnecting ? 'Generating link...' : 'Continue setup'}
                        </Button>
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              )}
              
              <div className="flex justify-end">
                <Button 
                  variant="destructive" 
                  onClick={handleDisconnectStripe}
                  disabled={isDisconnecting}
                >
                  {isDisconnecting ? 'Disconnecting...' : 'Disconnect Stripe Account'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="text-center py-8">
                <h3 className="text-lg font-medium mb-2">Connect your Stripe account</h3>
                <p className="text-gray-500 mb-6">
                  To accept payments for your services, you need to connect a Stripe account.
                  This allows you to receive payments directly from your patients.
                </p>
                <Button 
                  onClick={handleConnectStripe}
                  disabled={isConnecting}
                  className="mx-auto"
                >
                  {isConnecting ? 'Connecting...' : 'Connect Stripe Account'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment FAQ</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h3 className="font-medium mb-1">How do payments work?</h3>
              <p className="text-gray-600 text-sm">
                When you create a service with a fee, patients can pay for it directly through our platform.
                Payments are processed securely through Stripe and deposited to your connected bank account.
              </p>
            </div>
            
            <div>
              <h3 className="font-medium mb-1">What are the fees?</h3>
              <p className="text-gray-600 text-sm">
                Stripe charges a standard processing fee of 2.9% + $0.30 per transaction.
                Please refer to Stripe's documentation for the most up-to-date information on fees.
              </p>
            </div>
            
            <div>
              <h3 className="font-medium mb-1">How do I receive my money?</h3>
              <p className="text-gray-600 text-sm">
                Funds are automatically transferred to your bank account on a rolling basis.
                The default payout schedule is 2 business days, but this may vary depending on your country and account status.
              </p>
            </div>
            
            <div>
              <h3 className="font-medium mb-1">Is my information secure?</h3>
              <p className="text-gray-600 text-sm">
                Yes, all sensitive financial information is handled directly by Stripe, which maintains the highest level of security certification in the payments industry.
                We never store your banking details on our servers.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Badge component for Stripe account status
function Badge({ children, variant }: { children: React.ReactNode, variant: 'success' | 'warning' | 'error' }) {
  const baseClasses = "px-2 py-1 rounded-full text-xs font-medium";
  const variantClasses = {
    success: "bg-green-100 text-green-800",
    warning: "bg-yellow-100 text-yellow-800",
    error: "bg-red-100 text-red-800"
  };
  
  return (
    <span className={`${baseClasses} ${variantClasses[variant]}`}>
      {children}
    </span>
  );
}

// Status card component for Stripe account status items
function StatusCard({ 
  title, 
  isComplete, 
  description 
}: { 
  title: string, 
  isComplete: boolean, 
  description: string 
}) {
  return (
    <div className={`p-4 rounded-lg border ${isComplete ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
      <div className="flex items-center mb-2">
        {isComplete ? (
          <CheckCircleIcon className="h-5 w-5 text-green-500 mr-2" />
        ) : (
          <XCircleIcon className="h-5 w-5 text-yellow-500 mr-2" />
        )}
        <h3 className="font-medium">{title}</h3>
      </div>
      <p className="text-sm text-gray-600">{description}</p>
    </div>
  );
}
