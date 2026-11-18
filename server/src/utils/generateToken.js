/**
 * src/utils/generateToken.js – creates the login token (a JWT) for a user.
 *
 * A JWT (JSON Web Token) is a small signed text: header.payload.signature.
 * The server signs it with JWT_SECRET. Later, `protect` checks the signature: if anyone
 * changed even one character (e.g. role "customer" → "admin"), the check fails.
 *
 * IMPORTANT: a JWT is SIGNED, not ENCRYPTED. Anyone can read the payload (try jwt.io).
 * So we store only the user id, role and token version: no email, no name, never a password.
 *   v = the user's tokenVersion right now. If the password changes later, the version
 *       goes up and this token is rejected by `protect` (see user.model.js).
 */
import jwt from 'jsonwebtoken';
import env from '../config/env.js';

export default function generateToken(user) {
  return jwt.sign(
    { id: user._id.toString(), role: user.role, v: user.tokenVersion ?? 0 }, // the minimum we need
    env.JWT_SECRET, // secret key used for the signature
    { expiresIn: env.JWT_EXPIRES_IN }, // e.g. '1d' → token stops working after 1 day
  );
}
