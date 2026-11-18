/**
 * src/db/scripts/seedAdmin.js – creates the admin account. Run: `npm run seed:admin`
 *
 * WHY A SCRIPT? Registration always creates CUSTOMERS (nobody can sign up as admin),
 * so the first admin must be created by someone with database access, using ADMIN_*
 * values from .env.
 *
 * "Idempotent": running it twice is safe. It creates the admin only if missing.
 */
import mongoose from 'mongoose';
import env from '../../config/env.js';
import { User } from '../../modules/models.js';

await mongoose.connect(env.MONGO_URI);

try {
  const existing = await User.findOne({ email: env.ADMIN_EMAIL });

  if (existing && existing.role !== 'admin') {
    // Safety: never silently turn an existing customer into an admin
    console.error(
      `❌ ${env.ADMIN_EMAIL} already belongs to a CUSTOMER account. Use another ADMIN_EMAIL.`,
    );
    process.exitCode = 1;
  } else if (existing) {
    console.log(`✔ Admin already exists: ${env.ADMIN_EMAIL}`);
  } else {
    // new User(...) + save() → validation runs and the pre-save hook hashes the password
    await new User({
      name: env.ADMIN_NAME,
      email: env.ADMIN_EMAIL,
      password: env.ADMIN_PASSWORD,
      role: 'admin',
      isEmailVerified: true, // we trust the address we configured ourselves
    }).save();
    console.log(`✔ Admin created: ${env.ADMIN_EMAIL}`);
  }
} finally {
  await mongoose.disconnect(); // always close, even after an error
}
