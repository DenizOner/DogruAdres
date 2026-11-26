import type { HttpTypes } from '@medusajs/types';

export type PaymentSessionLike = {
  id?: string;
  provider_id?: string;
  status?: string;
  amount?: number;
  data?: Record<string, unknown>;
};

/**
 * Returns the active payment session in order of authority (#165):
 * 1. 'pending' session (currently initiated and awaiting completion)
 * 2. 'authorized' session
 * 3. Fallback to the first available session if none are pending/authorized.
 */
export function getActivePaymentSession<T extends PaymentSessionLike = HttpTypes.StorePaymentSession>(
  paymentSessions?: T[] | null
): T | undefined {
  if (!paymentSessions || !Array.isArray(paymentSessions) || paymentSessions.length === 0) {
    return undefined;
  }

  const pending = paymentSessions.find((s) => s.status === 'pending');
  if (pending) return pending;

  const authorized = paymentSessions.find((s) => s.status === 'authorized');
  if (authorized) return authorized;

  return paymentSessions[0];
}

/**
 * Reconciles whether a given provider matches the currently active session (#165).
 */
export function isSessionMatchingProvider(
  session?: PaymentSessionLike | null,
  providerId?: string | null
): boolean {
  if (!session?.provider_id || !providerId) return false;
  return session.provider_id === providerId;
}
