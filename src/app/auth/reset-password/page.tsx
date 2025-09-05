'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EyeIcon, EyeSlashIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import Image from 'next/image';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [isValidToken, setIsValidToken] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (token) {
      validateToken();
    } else {
      setIsValidating(false);
      setError('Invalid reset link');
    }
  }, [token]);

  const validateToken = async () => {
    try {
      const response = await fetch('/api/auth/validate-reset-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token })
      });

      if (response.ok) {
        const data = await response.json();
        setIsValidToken(true);
        setUserEmail(data.email);
      } else {
        const error = await response.json();
        setError(error.error || 'Invalid or expired reset link');
      }
    } catch (error) {
      console.error('Error validating token:', error);
      setError('Error validating reset link');
    } finally {
      setIsValidating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    try {
      setIsLoading(true);
      setError('');

      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token, password })
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Password reset successful:', data);
        setSuccess(true);
        
        // Get email from response if available
        const emailToUse = data.email || '';
        
        setTimeout(() => {
          console.log('Redirecting to signin page with email:', emailToUse);
          // Redirect to signin page with email parameter to help with auto-login
          router.push(`/auth/signin?reset=true&email=${encodeURIComponent(emailToUse)}`);
        }, 3000);
      } else {
        const error = await response.json();
        setError(error.error || 'Error updating password');
      }
    } catch (error) {
      console.error('Error resetting password:', error);
      setError('Error updating password');
    } finally {
      setIsLoading(false);
    }
  };

  if (isValidating) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white font-normal tracking-[-0.03em] relative z-10">
        {/* Floating logo */}
        <div className="absolute top-4 left-4">
          <div className="relative w-8 h-8">
            <Image src="/logo.png" alt="Logo" fill className="object-contain" priority />
          </div>
        </div>
        <div className="min-h-screen flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-[420px] bg-white rounded-2xl border border-gray-200 p-8 shadow-lg relative z-20">
            
            {/* Skeleton Logo */}
            <div className="text-center mb-6">
              <div className="flex justify-center items-center mb-4">
                <div className="w-16 h-16 bg-gray-200 rounded-xl animate-pulse"></div>
              </div>
              
              {/* Skeleton Title */}
              <div className="h-6 bg-gray-200 rounded-lg animate-pulse mb-2 mx-8"></div>
              <div className="h-4 bg-gray-200 rounded animate-pulse mx-4"></div>
            </div>

            {/* Skeleton Form */}
            <div className="space-y-5">
              <div>
                <div className="h-4 bg-gray-200 rounded animate-pulse mb-2 w-24"></div>
                <div className="h-10 bg-gray-200 rounded-lg animate-pulse"></div>
              </div>
              
              <div>
                <div className="h-4 bg-gray-200 rounded animate-pulse mb-2 w-32"></div>
                <div className="h-10 bg-gray-200 rounded-lg animate-pulse"></div>
              </div>

              {/* Skeleton Requirements */}
              <div className="space-y-2">
                <div className="h-3 bg-gray-200 rounded animate-pulse w-32"></div>
                <div className="space-y-1">
                  <div className="h-3 bg-gray-200 rounded animate-pulse w-28"></div>
                  <div className="h-3 bg-gray-200 rounded animate-pulse w-24"></div>
                </div>
              </div>

              <div className="h-12 bg-gray-200 rounded-lg animate-pulse"></div>
            </div>

            {/* Skeleton footer */}
            <div className="mt-6 pt-4 border-t border-gray-200">
              <div className="flex items-center justify-center gap-2">
                <div className="h-3 bg-gray-200 rounded animate-pulse w-16"></div>
                <div className="h-3 bg-gray-200 rounded animate-pulse w-8"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isValidToken) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white font-normal tracking-[-0.03em] relative z-10">
        {/* Floating logo */}
        <div className="absolute top-4 left-4">
          <div className="relative w-8 h-8">
            <Image src="/logo.png" alt="Logo" fill className="object-contain" priority />
          </div>
        </div>
        <div className="min-h-screen flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-[420px] bg-white rounded-2xl border border-gray-200 p-8 shadow-lg relative z-20">
            <div className="text-center">
              <div className="w-16 h-16 rounded-xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                <XCircleIcon className="h-8 w-8 text-red-500" />
              </div>
              <h2 className="text-xl font-medium text-gray-900 mb-2">Invalid Reset Link</h2>
              <p className="text-gray-600 mb-6">{error}</p>
              <button
                onClick={() => router.push('/auth/signin')}
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-black hover:bg-gray-900 rounded-lg transition-colors duration-200"
              >
                Back to Sign In
              </button>
              
              {/* Footer */}
              <div className="mt-6 pt-4 border-t border-gray-200">
                <div className="flex items-center justify-center gap-2">
                  <span className="text-xs text-gray-400">Powered by</span>
                  <Image
                    src="/logo.png"
                    alt="Sistema"
                    width={32}
                    height={10}
                    className="object-contain opacity-60"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white font-normal tracking-[-0.03em] relative z-10">
        {/* Floating logo */}
        <div className="absolute top-4 left-4">
          <div className="relative w-8 h-8">
            <Image src="/logo.png" alt="Logo" fill className="object-contain" priority />
          </div>
        </div>
        <div className="min-h-screen flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-[420px] bg-white rounded-2xl border border-gray-200 p-8 shadow-lg relative z-20">
            <div className="text-center">
              <div className="w-16 h-16 rounded-xl bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                <CheckCircleIcon className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="text-xl font-medium text-gray-900 mb-2">Password Updated!</h2>
              <p className="text-gray-600 mb-6">Your password has been successfully updated.</p>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full animate-pulse"></div>
              </div>
              
              {/* Footer */}
              <div className="mt-6 pt-4 border-t border-gray-200">
                <div className="flex items-center justify-center gap-2">
                  <span className="text-xs text-gray-400">Powered by</span>
                  <Image
                    src="/logo.png"
                    alt="Sistema"
                    width={32}
                    height={10}
                    className="object-contain opacity-60"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white font-normal tracking-[-0.03em] relative z-10">
      {/* Floating logo */}
      <div className="absolute top-4 left-4">
        <div className="relative w-8 h-8">
          <Image src="/logo.png" alt="Logo" fill className="object-contain" priority />
        </div>
      </div>
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-[420px] bg-white rounded-2xl border border-gray-200 p-8 shadow-lg relative z-20">
          
          {/* Logo/Icon */}
          <div className="text-center mb-6">
            <h1 className="text-xl font-medium text-gray-900 mb-2">Set Your Password</h1>
            <p className="text-gray-600 text-sm">Welcome! Please set your password to access your account.</p>
            {userEmail && (
              <p className="text-xs text-gray-500 mt-2">Account: {userEmail}</p>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 text-red-600 text-center text-sm">{error}</div>
          )}
          
          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                New Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your new password"
                  className="w-full px-4 py-2.5 pr-10 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5154e7]/20 focus:border-[#5154e7] transition-all duration-200 text-gray-900 placeholder-gray-500"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? (
                    <EyeSlashIcon className="h-4 w-4" />
                  ) : (
                    <EyeIcon className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your new password"
                  className="w-full px-4 py-2.5 pr-10 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5154e7]/20 focus:border-[#5154e7] transition-all duration-200 text-gray-900 placeholder-gray-500"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showConfirmPassword ? (
                    <EyeSlashIcon className="h-4 w-4" />
                  ) : (
                    <EyeIcon className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            
            <div className="space-y-2">
              <p className="text-xs text-gray-500 font-medium">Password requirements:</p>
              <ul className="text-xs text-gray-500 space-y-1">
                <li className={`flex items-center gap-2 ${password.length >= 6 ? 'text-green-600' : ''}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${password.length >= 6 ? 'bg-green-600' : 'bg-gray-300'}`}></span>
                  At least 6 characters
                </li>
                <li className={`flex items-center gap-2 ${password === confirmPassword && password.length > 0 ? 'text-green-600' : ''}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${password === confirmPassword && password.length > 0 ? 'bg-green-600' : 'bg-gray-300'}`}></span>
                  Passwords match
                </li>
              </ul>
            </div>
            
            <button
              type="submit"
              disabled={isLoading || password !== confirmPassword || password.length < 6}
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-black hover:bg-gray-900 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  Updating Password...
                </>
              ) : (
                'Set Password'
              )}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white font-normal tracking-[-0.03em] relative z-10">
      {/* Floating logo */}
      <div className="absolute top-4 left-4">
        <div className="relative w-8 h-8">
          <Image src="/logo.png" alt="Logo" fill className="object-contain" priority />
        </div>
      </div>
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-[420px] bg-white rounded-2xl border border-gray-200 p-8 shadow-lg relative z-20">
          
          {/* Skeleton Logo */}
          <div className="text-center mb-6">
            <div className="flex justify-center items-center mb-4">
              <div className="w-16 h-16 bg-gray-700 rounded-xl animate-pulse"></div>
            </div>
            
            {/* Skeleton Title */}
            <div className="h-6 bg-gray-700 rounded-lg animate-pulse mb-2 mx-8"></div>
            <div className="h-4 bg-gray-700 rounded animate-pulse mx-4"></div>
          </div>

          {/* Skeleton Form */}
          <div className="space-y-5">
            <div>
              <div className="h-4 bg-gray-700 rounded animate-pulse mb-2 w-24"></div>
              <div className="h-10 bg-gray-700 rounded-lg animate-pulse"></div>
            </div>
            
            <div>
              <div className="h-4 bg-gray-700 rounded animate-pulse mb-2 w-32"></div>
              <div className="h-10 bg-gray-700 rounded-lg animate-pulse"></div>
            </div>

            {/* Skeleton Requirements */}
            <div className="space-y-2">
              <div className="h-3 bg-gray-200 rounded animate-pulse w-32"></div>
              <div className="space-y-1">
                <div className="h-3 bg-gray-200 rounded animate-pulse w-28"></div>
                <div className="h-3 bg-gray-200 rounded animate-pulse w-24"></div>
              </div>
            </div>

            <div className="h-12 bg-gray-700 rounded-lg animate-pulse"></div>
          </div>

          {/* Skeleton Logo do sistema */}
          <div className="mt-6 pt-4 border-t border-gray-800">
            <div className="flex items-center justify-center gap-2">
              <div className="h-3 bg-gray-700 rounded animate-pulse w-16"></div>
              <div className="h-3 bg-gray-700 rounded animate-pulse w-8"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ResetPasswordForm />
    </Suspense>
  );
} 