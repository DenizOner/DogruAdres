import type { HttpTypes } from '@medusajs/types';

export type PaymentSessionLike = {
  id?: string;
  provider_id?: string;
  status?: string;
  amount?: number;
  data?: Record<string, unknown>;
};

export const TERMINAL_PAYMENT_SESSION_STATUSES = new Set(['canceled', 'error']);

/**
 * Returns the active payment session in order of authority (#165):
 * 1. 'pending' session (currently initiated and awaiting completion)
 * 2. 'authorized' session
 * 3. 'requires_more' session (action needed)
 * 4. Fallback to any non-terminal session (excluding canceled/error).
 *
 * Terminal sessions ('canceled', 'error') are never considered active.
 * If all sessions are terminal or no sessions exist, returns undefined so
 * that callers can initiate a fresh session.
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

  const requiresMore = paymentSessions.find((s) => s.status === 'requires_more');
  if (requiresMore) return requiresMore;

  const nonTerminal = paymentSessions.find(
    (s) => !s.status || !TERMINAL_PAYMENT_SESSION_STATUSES.has(s.status)
  );
  if (nonTerminal) return nonTerminal;

  return undefined;
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
