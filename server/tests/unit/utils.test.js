/**
 * UNIT tests for small helpers: generateToken, ApiError, sendSuccess, asyncHandler,
 * email templates and the test email outbox.
 */
// In ES-module mode the `jest` object must be imported (describe/it/expect are still global)
import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import generateToken from '../../src/utils/generateToken.js';
import ApiError from '../../src/utils/ApiError.js';
import { sendSuccess } from '../../src/utils/ApiResponse.js';
import asyncHandler from '../../src/utils/asyncHandler.js';
import sendEmail, { outbox, clearOutbox } from '../../src/emails/sendEmail.js';
import {
  escapeHtml,
  verifyEmailTemplate,
  resetPasswordTemplate,
  passwordChangedTemplate,
} from '../../src/emails/templates.js';

describe('generateToken', () => {
  it('stores ONLY the user id and role in the token', () => {
    const user = { _id: new mongoose.Types.ObjectId(), role: 'customer', email: 'a@b.co' };
    const payload = jwt.verify(generateToken(user), process.env.JWT_SECRET);
    expect(payload.id).toBe(user._id.toString());
    expect(payload.role).toBe('customer');
    expect(payload.email).toBeUndefined(); // no personal data inside a JWT
    expect(payload.exp).toBeGreaterThan(payload.iat); // it expires
  });
});

describe('ApiError', () => {
  it('is a real Error carrying statusCode and errors', () => {
    const err = new ApiError(404, 'Not found');
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(404);
    expect(err.errors).toEqual([]);
  });
});

describe('sendSuccess', () => {
  const fakeRes = () => ({
    status(code) {
      this.code = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  });

  it('sends the standard envelope', () => {
    const res = sendSuccess(fakeRes(), 201, 'Created', { a: 1 });
    expect(res.code).toBe(201);
    expect(res.body).toEqual({ success: true, message: 'Created', data: { a: 1 } });
  });

  it('adds meta only when given', () => {
    const res = sendSuccess(fakeRes(), 200, 'OK', [], { page: 1 });
    expect(res.body.meta).toEqual({ page: 1 });
  });
});

describe('asyncHandler', () => {
  it('forwards a rejected promise to next(err)', async () => {
    const boom = new Error('boom');
    const next = jest.fn();
    await asyncHandler(async () => {
      throw boom;
    })({}, {}, next);
    expect(next).toHaveBeenCalledWith(boom);
  });
});

describe('email templates', () => {
  it('escapes HTML in names (no HTML injection)', () => {
    expect(escapeHtml('<b>"x" & y</b>')).toBe('&lt;b&gt;&quot;x&quot; &amp; y&lt;/b&gt;');
    const { html } = verifyEmailTemplate('<script>', 'abc');
    expect(html).not.toContain('<script>');
  });

  it('builds frontend links that carry the token', () => {
    expect(verifyEmailTemplate('Ali', 'tok123').text).toContain(
      'http://localhost:5173/verify-email?token=tok123',
    );
    expect(resetPasswordTemplate('Ali', 'tok456').text).toContain('/reset-password?token=tok456');
    expect(passwordChangedTemplate('Ali').subject).toMatch(/password was changed/);
  });
});

describe('sendEmail in test mode', () => {
  it('stores emails in the outbox instead of sending them', async () => {
    clearOutbox();
    await sendEmail({ to: 'a@b.co', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' });
    expect(outbox).toHaveLength(1);
    expect(outbox[0].to).toBe('a@b.co');
    clearOutbox();
    expect(outbox).toHaveLength(0);
  });
});
