import { loadStripe } from "@stripe/stripe-js"
import { env } from "./env"

/**
 * Lazy Stripe loader
 * Prevents app from crashing if Stripe isn't configured.
 */

let stripePromise: Promise<any> | null = null

export function getStripe() {
  if (!env.STRIPE_PK) {
    throw new Error(
      "Stripe is not configured. Please set VITE_STRIPE_PK in your environment variables."
    )
  }

  if (!stripePromise) {
    stripePromise = loadStripe(env.STRIPE_PK)
  }

  return stripePromise
}

/**
 * Redirect user to Stripe Checkout
 */

export async function redirectToCheckout({
  priceId,
  userId,
  email
}: {
  priceId: string
  userId: string
  email: string
}) {
  const stripe = await getStripe()

  const response = await fetch("/api/stripe/checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      priceId,
      userId,
      email
    })
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Stripe checkout failed: ${text}`)
  }

  const data = await response.json()

  if (!data.sessionId) {
    throw new Error("Stripe session ID missing from response")
  }

  const { error } = await stripe.redirectToCheckout({
    sessionId: data.sessionId
  })

  if (error) {
    throw error
  }
}
