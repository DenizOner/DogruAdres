"use client"

import { loadStripe } from "@stripe/stripe-js"
import React from "react"
import { HttpTypes } from "@medusajs/types"
import { isStripe } from "@/lib/constants"
import { getActivePaymentSession } from "@/lib/helpers/payment-session-utils"
import StripeWrapper from "./StripeWrapper"

type PaymentWrapperProps = {
  cart: HttpTypes.StoreCart
  children: React.ReactNode
}

const stripeKey = process.env.NEXT_PUBLIC_STRIPE_KEY
const stripePromise = stripeKey ? loadStripe(stripeKey) : null

const PaymentWrapper: React.FC<PaymentWrapperProps> = ({ cart, children }) => {
  const paymentSession = getActivePaymentSession(
    cart.payment_collection?.payment_sessions
  )

  if (
    isStripe(paymentSession?.provider_id) &&
    paymentSession &&
    stripePromise
  ) {
    return (
      <StripeWrapper
        paymentSession={paymentSession}
        stripeKey={stripeKey}
        stripePromise={stripePromise}
      >
        {children}
      </StripeWrapper>
    )
  }

  return <div>{children}</div>
}

export default PaymentWrapper
