import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isValidDate(dateString: string): boolean {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
}

export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Normalizes an email address to prevent case-sensitivity duplicates
 * - Converts to lowercase
 * - Trims whitespace
 * - Returns null for empty/invalid emails
 * 
 * @example
 * normalizeEmail('Tainara.ped@hotmail.com') // 'tainara.ped@hotmail.com'
 * normalizeEmail('  USER@EXAMPLE.COM  ') // 'user@example.com'
 * normalizeEmail('') // null
 */
export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null
  const normalized = String(email).trim().toLowerCase()
  return normalized === '' ? null : normalized
}
