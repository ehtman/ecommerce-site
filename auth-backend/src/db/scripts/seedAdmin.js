// npm run seed:admin  →  creates the admin account from ADMIN_* env vars (safe to re-run).
import mongoose from 'mongoose';
import env from '../../config/env.js';
import { User } from '../../modules/models.js';

await mongoose.connect(env.MONGO_URI);

const admin = await User.findOneAndUpdate(
  { email: env.ADMIN_EMAIL },
  { $setOnInsert: { name: env.ADMIN_NAME, email: env.ADMIN_EMAIL, role: 'admin', isEmailVerified: true } },
  { upsert: true, new: true },
);
if (!(await User.findById(admin._id).select('+password')).password) {
  admin.password = env.ADMIN_PASSWORD; await admin.save(); // hashed by pre-save hook
}
console.log(`✔ Admin: ${env.ADMIN_EMAIL}`);
await mongoose.disconnect();
