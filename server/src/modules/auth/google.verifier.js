/**
 * src/modules/auth/google.verifier.js – checks a Google sign-in token with Google's library.
 *
 * WHY A SEPARATE FILE? It is a boundary to an EXTERNAL service. Keeping it in one small
 * object means tests can replace `googleVerifier.verify` with a fake ("test double")
 * and test our login logic without calling Google over the internet.
 */
import { OAuth2Client } from 'google-auth-library';
import env from '../../config/env.js';

// One client for the app. It caches Google's public keys used to check signatures.
const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);

export const googleVerifier = {
  /**
   * Verifies the ID token and returns its payload: { sub, email, email_verified, name, … }.
   * Throws if the token is fake, expired, or was made for a different app ("audience").
   */
  async verify(credential) {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: env.GOOGLE_CLIENT_ID, // the token must be meant for OUR app
    });
    return ticket.getPayload();
  },
};
