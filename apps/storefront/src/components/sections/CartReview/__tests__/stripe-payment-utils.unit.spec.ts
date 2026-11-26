import { describe, expect, it } from 'bun:test';
import {
  buildStripeBillingName,
  evaluateStripePaymentResult,
} from '../stripe-payment-utils';

describe('stripe-payment-utils (#166)', () => {
  describe('evaluateStripePaymentResult', () => {
    it('returns shouldPlaceOrder=true on paymentIntent succeeded', () => {
      const evaluation = evaluateStripePaymentResult({
        paymentIntent: { status: 'succeeded' },
      });
      expect(evaluation.shouldPlaceOrder).toBe(true);
      expect(evaluation.errorMessage).toBeNull();
      expect(evaluation.status).toBe('succeeded');
    });

    it('returns shouldPlaceOrder=true on paymentIntent requires_capture', () => {
      const evaluation = evaluateStripePaymentResult({
        paymentIntent: { status: 'requires_capture' },
      });
      expect(evaluation.shouldPlaceOrder).toBe(true);
      expect(evaluation.errorMessage).toBeNull();
      expect(evaluation.status).toBe('requires_capture');
    });

    it('handles missing paymentIntent without throwing TypeError (#166)', () => {
      // Prior bug: conditional checked (paymentIntent && ...) || paymentIntent.status === 'succeeded',
      // which threw TypeError when paymentIntent was undefined!
      expect(() => evaluateStripePaymentResult({})).not.toThrow();
      const evaluation = evaluateStripePaymentResult({});
      expect(evaluation.shouldPlaceOrder).toBe(false);
      expect(evaluation.errorMessage).toBe('Payment confirmation did not return a valid status');
      expect(evaluation.status).toBe('unconfirmed');
    });

    it('handles null or undefined result gracefully', () => {
      const evalNull = evaluateStripePaymentResult(null);
      expect(evalNull.shouldPlaceOrder).toBe(false);
      expect(evalNull.status).toBe('failed');

      const evalUndef = evaluateStripePaymentResult(undefined);
      expect(evalUndef.shouldPlaceOrder).toBe(false);
      expect(evalUndef.status).toBe('failed');
    });

    it('returns shouldPlaceOrder=false and error message on error', () => {
      const evaluation = evaluateStripePaymentResult({
        error: { message: 'Your card has insufficient funds.' },
      });
      expect(evaluation.shouldPlaceOrder).toBe(false);
      expect(evaluation.errorMessage).toBe('Your card has insufficient funds.');
      expect(evaluation.status).toBe('failed');
    });

    it('handles error without explicit message with safe default', () => {
      const evaluation = evaluateStripePaymentResult({
        error: {},
      });
      expect(evaluation.shouldPlaceOrder).toBe(false);
      expect(evaluation.errorMessage).toBe('Payment confirmation failed');
      expect(evaluation.status).toBe('failed');
    });

    it('proceeds with order if error payment_intent status succeeded or requires_capture', () => {
      const evaluation = evaluateStripePaymentResult({
        error: {
          message: 'Minor non-blocking notice',
          payment_intent: { status: 'succeeded' },
        },
      });
      expect(evaluation.shouldPlaceOrder).toBe(true);
      expect(evaluation.status).toBe('succeeded');
      expect(evaluation.errorMessage).toBe('Minor non-blocking notice');
    });

    it('handles unexpected paymentIntent statuses (e.g. requires_action, canceled)', () => {
      const evaluation = evaluateStripePaymentResult({
        paymentIntent: { status: 'requires_action' },
      });
      expect(evaluation.shouldPlaceOrder).toBe(false);
      expect(evaluation.status).toBe('unconfirmed');
      expect(evaluation.errorMessage).toContain('requires_action');
    });
  });

  describe('buildStripeBillingName', () => {
    it('joins first and last name cleanly', () => {
      expect(buildStripeBillingName('Ahmet', 'Yilmaz')).toBe('Ahmet Yilmaz');
    });

    it('handles only first name or only last name without undefined string', () => {
      expect(buildStripeBillingName('Ahmet', null)).toBe('Ahmet');
      expect(buildStripeBillingName(undefined, 'Yilmaz')).toBe('Yilmaz');
      expect(buildStripeBillingName('', 'Yilmaz')).toBe('Yilmaz');
    });

    it('returns undefined when both names are empty, null or undefined', () => {
      expect(buildStripeBillingName(null, null)).toBeUndefined();
      expect(buildStripeBillingName(undefined, undefined)).toBeUndefined();
      expect(buildStripeBillingName('  ', '')).toBeUndefined();
    });
  });
});
