import jwt from 'jsonwebtoken';
import env from '../config/env.js';

// The token holds ONLY the user id and role (no personal data).
export default function generateToken(user) {
  return jwt.sign({ id: user._id.toString(), role: user.role }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });
}
