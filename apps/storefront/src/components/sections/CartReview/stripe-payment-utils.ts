export type StripePaymentIntentLike = {
  status?: string;
};

export type StripeErrorLike = {
  message?: string;
  payment_intent?: StripePaymentIntentLike;
};

export type StripePaymentResultLike = {
  error?: StripeErrorLike;
  paymentIntent?: StripePaymentIntentLike;
};

export type StripePaymentEvaluation = {
  shouldPlaceOrder: boolean;
  errorMessage: string | null;
  status: 'succeeded' | 'requires_capture' | 'failed' | 'unconfirmed';
};

/**
 * Evaluates Stripe confirmCardPayment result with complete null/undefined safety (#166).
 * Handles missing paymentIntent, error branches, decline codes, and unexpected statuses.
 */
export function evaluateStripePaymentResult(
  result?: StripePaymentResultLike | null
): StripePaymentEvaluation {
  if (!result) {
    return {
      shouldPlaceOrder: false,
      errorMessage: 'No response received from payment provider',
      status: 'failed',
    };
  }

  const { error, paymentIntent } = result;

  if (error) {
    const pi = error.payment_intent;
    const piStatus = pi?.status;
    // Even if an error was reported, if the payment intent actually succeeded or requires capture:
    if (piStatus === 'requires_capture' || piStatus === 'succeeded') {
      return {
        shouldPlaceOrder: true,
        errorMessage: error.message || null,
        status: piStatus,
      };
    }

    return {
      shouldPlaceOrder: false,
      errorMessage: error.message || 'Payment confirmation failed',
      status: 'failed',
    };
  }

  const intentStatus = paymentIntent?.status;
  if (intentStatus === 'requires_capture' || intentStatus === 'succeeded') {
    return {
      shouldPlaceOrder: true,
      errorMessage: null,
      status: intentStatus,
    };
  }

  return {
    shouldPlaceOrder: false,
    errorMessage: intentStatus
      ? `Payment status is ${intentStatus}; payment could not be completed`
      : 'Payment confirmation did not return a valid status',
    status: 'unconfirmed',
  };
}

/**
 * Builds Stripe cardholder billing name safely without emitting 'undefined undefined' (#166).
 */
export function buildStripeBillingName(
  firstName?: string | null,
  lastName?: string | null
): string | undefined {
  const parts = [firstName, lastName].filter(
    (p): p is string => typeof p === 'string' && p.trim().length > 0
  );
  return parts.length > 0 ? parts.join(' ').trim() : undefined;
}
