import { describe, expect, it } from 'bun:test';
import {
  getActivePaymentSession,
  isSessionMatchingProvider,
  type PaymentSessionLike,
} from '../payment-session-utils';

describe('payment-session-utils (#165)', () => {
  describe('getActivePaymentSession', () => {
    it('returns the pending session when present among multiple sessions', () => {
      const sessions: PaymentSessionLike[] = [
        { id: 'sess_1', provider_id: 'pp_system_default', status: 'canceled' },
        { id: 'sess_2', provider_id: 'pp_stripe_stripe', status: 'pending' },
        { id: 'sess_3', provider_id: 'manual', status: 'requires_more' },
      ];

      const active = getActivePaymentSession(sessions);
      expect(active?.id).toBe('sess_2');
      expect(active?.provider_id).toBe('pp_stripe_stripe');
      expect(active?.status).toBe('pending');
    });

    it('returns the authorized session when no pending session exists', () => {
      const sessions: PaymentSessionLike[] = [
        { id: 'sess_1', provider_id: 'pp_system_default', status: 'canceled' },
        { id: 'sess_2', provider_id: 'pp_stripe_stripe', status: 'authorized' },
      ];

      const active = getActivePaymentSession(sessions);
      expect(active?.id).toBe('sess_2');
      expect(active?.status).toBe('authorized');
    });

    it('falls back to index 0 when neither pending nor authorized sessions exist', () => {
      const sessions: PaymentSessionLike[] = [
        { id: 'sess_1', provider_id: 'pp_system_default', status: 'initiated' },
        { id: 'sess_2', provider_id: 'pp_stripe_stripe', status: 'canceled' },
      ];

      const active = getActivePaymentSession(sessions);
      expect(active?.id).toBe('sess_1');
    });

    it('returns undefined for empty array, null, or undefined', () => {
      expect(getActivePaymentSession([])).toBeUndefined();
      expect(getActivePaymentSession(null)).toBeUndefined();
      expect(getActivePaymentSession(undefined)).toBeUndefined();
    });
  });

  describe('isSessionMatchingProvider', () => {
    it('returns true when session provider_id matches target provider', () => {
      const session = { id: 'sess_1', provider_id: 'pp_stripe_stripe', status: 'pending' };
      expect(isSessionMatchingProvider(session, 'pp_stripe_stripe')).toBe(true);
    });

    it('returns false when provider_id does not match or values are missing', () => {
      const session = { id: 'sess_1', provider_id: 'pp_stripe_stripe', status: 'pending' };
      expect(isSessionMatchingProvider(session, 'pp_system_default')).toBe(false);
      expect(isSessionMatchingProvider(null, 'pp_stripe_stripe')).toBe(false);
      expect(isSessionMatchingProvider(session, null)).toBe(false);
      expect(isSessionMatchingProvider(undefined, undefined)).toBe(false);
    });
  });
});
