/**
 * UNIT tests for the User model's methods.
 * Unit = test one small piece in isolation. These do not even need a database:
 * we create documents in memory with `new User(...)` and never save them.
 */
import bcrypt from 'bcrypt';
import { User } from '../../src/modules/models.js';

describe('User model', () => {
  it('defaults new users to role "customer", local provider, unverified and active', () => {
    const user = new User({ name: 'Ali', email: 'ali@example.com', password: 'x' });
    expect(user.role).toBe('customer');
    expect(user.authProvider).toBe('local');
    expect(user.isEmailVerified).toBe(false);
    expect(user.isActive).toBe(true);
  });

  it('requires a password for local accounts but not for Google accounts', () => {
    const local = new User({ name: 'Ali', email: 'ali@example.com' });
    expect(local.validateSync().errors.password).toBeDefined();

    const google = new User({ name: 'Ali', email: 'ali@example.com', authProvider: 'google' });
    expect(google.validateSync()).toBeUndefined();
  });

  it('rejects invalid emails and too-short names', () => {
    const user = new User({ name: 'A', email: 'not-an-email', password: 'x' });
    const { errors } = user.validateSync();
    expect(errors.email.message).toBe('Email is invalid');
    expect(errors.name.message).toBe('Name must be at least 2 characters');
  });

  it('comparePassword returns true only for the right password', async () => {
    const user = new User({ name: 'Ali', email: 'a@b.co' });
    user.password = await bcrypt.hash('secret123', 4); // low cost = fast test
    await expect(user.comparePassword('secret123')).resolves.toBe(true);
    await expect(user.comparePassword('wrong')).resolves.toBe(false);
  });

  it('comparePassword returns false when there is no password (Google account)', async () => {
    const user = new User({ name: 'Ali', email: 'a@b.co', authProvider: 'google' });
    await expect(user.comparePassword('anything')).resolves.toBe(false);
  });

  it('isTokenOutdated compares the token version with the user version', () => {
    const user = new User({ name: 'Ali', email: 'a@b.co', password: 'x' });
    expect(user.tokenVersion).toBe(0);
    expect(user.isTokenOutdated(0)).toBe(false); // current token
    expect(user.isTokenOutdated(undefined)).toBe(true); // token without a version

    user.tokenVersion = 1; // password changed once
    expect(user.isTokenOutdated(0)).toBe(true); // old token
    expect(user.isTokenOutdated(1)).toBe(false); // fresh token
  });

  it('stores only a SHA-256 hash of email/reset tokens, never the token itself', () => {
    const user = new User({ name: 'Ali', email: 'a@b.co', password: 'x' });
    const verify = user.createEmailVerifyToken();
    const reset = user.createPasswordResetToken();

    expect(verify).toMatch(/^[a-f0-9]{64}$/); // 32 random bytes as hex
    expect(user.emailVerifyTokenHash).not.toBe(verify);
    expect(user.emailVerifyTokenHash).toHaveLength(64);
    expect(user.passwordResetTokenHash).not.toBe(reset);
  });

  it('sets the right expiry: 24h for verification, 30 min for reset', () => {
    const user = new User({ name: 'Ali', email: 'a@b.co', password: 'x' });
    const before = Date.now();
    user.createEmailVerifyToken();
    user.createPasswordResetToken();
    const day = 24 * 60 * 60 * 1000;
    const halfHour = 30 * 60 * 1000;
    expect(user.emailVerifyExpires.getTime()).toBeGreaterThanOrEqual(before + day - 1000);
    expect(user.passwordResetExpires.getTime()).toBeLessThanOrEqual(Date.now() + halfHour);
  });

  it('hides secrets when converted to JSON', () => {
    const user = new User({ name: 'Ali', email: 'a@b.co', password: 'hash' });
    user.createEmailVerifyToken();
    const json = user.toJSON();
    expect(json.password).toBeUndefined();
    expect(json.emailVerifyTokenHash).toBeUndefined();
    expect(json.__v).toBeUndefined();
    expect(json.id).toBeUndefined(); // only _id is kept
    expect(json._id).toBeDefined();
  });

  it('marks Google users as verified before validation', async () => {
    const user = new User({ name: 'Ali', email: 'a@b.co', authProvider: 'google' });
    await user.validate();
    expect(user.isEmailVerified).toBe(true);
  });
});
