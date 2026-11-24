/**
 * src/modules/payments/stripe.gateway.js – the ONLY file that talks to Stripe's library.
 *
 * WHAT: A tiny object with the three things our shop needs from Stripe:
 *         isConfigured()                     → do we have a secret key?
 *         createCheckoutSession(params)      → ask Stripe for a hosted payment page
 *         constructEvent(raw, signature, s)  → check a webhook's signature and parse it
 * WHY A SEPARATE FILE? Stripe is an EXTERNAL service on the internet. Wrapping it in one
 *       small object (like auth/google.verifier.js) gives us a "seam": tests replace
 *       `stripeGateway.createCheckoutSession` with a fake and never touch the network.
 *       Signature checks need no network at all, so tests use the REAL constructEvent.
 * USED BY: payment.service.js only.
 */
import Stripe from 'stripe';
import env from '../../config/env.js';

// The Stripe client is created LAZILY (on first use), not when the file is imported.
// Reason: without a secret key (card payments off) we never need a client at all.
let client = null;

export const stripeGateway = {
  /** true when a secret key is set, i.e. we are able to call Stripe's API. */
  isConfigured() {
    return Boolean(env.STRIPE_SECRET_KEY);
  },

  /** Returns the shared Stripe API client, creating it the first time. */
  getClient() {
    // `new Stripe(key)` only stores the key; no network call happens until a request
    if (!client) client = new Stripe(env.STRIPE_SECRET_KEY);
    return client;
  },

  /**
   * Creates a Stripe Checkout Session: a payment page HOSTED BY STRIPE. The customer types
   * the card number on stripe.com, never on our site, so card data never touches our
   * server (that keeps us out of most PCI card-security rules).
   * Returns Stripe's session object: { id: 'cs_test_…', url: 'https://checkout.stripe.com/…' }.
   */
  createCheckoutSession(params) {
    return this.getClient().checkout.sessions.create(params);
  },

  /**
   * Verifies a webhook and returns the parsed event. Throws if the signature is wrong,
   * the body was changed, or the timestamp is too old (protects against "replay" attacks).
   * `rawBody` MUST be the exact bytes Stripe sent (a Buffer), not re-built JSON:
   * the signature is computed over those bytes.
   * Uses the static `Stripe.webhooks` helper, which works without an API key or network.
   */
  constructEvent(rawBody, signature, secret) {
    return Stripe.webhooks.constructEvent(rawBody, signature, secret);
  },
};
