/**
 * src/db/scripts/seedCustomers.js – creates sample customer accounts.
 *
 * Run: npm run seed:customers
 *
 * WHY A SCRIPT?
 * Registration is available to customers, but for development and testing,
 * we need predictable customer accounts without manually registering them.
 *
 * IDEMPOTENT:
 * Running this script multiple times is safe.
 * Existing customer accounts are skipped.
 * Existing non-customer accounts are never modified.
 *
 * SECURITY:
 * Passwords are hashed automatically by the User model's pre-save hook.
 * Never store plaintext passwords in MongoDB.
 */

import mongoose from 'mongoose';
import env from '../../config/env.js';
import { User } from '../../modules/models.js';

const customers = [
  {
    name: 'Ali Ahmed',
    email: 'ali@example.com',
    password: 'Customer123!',
    phone: '03001234567',
  },
  {
    name: 'Usman Khan',
    email: 'usman@example.com',
    password: 'Customer123!',
    phone: '03011234567',
  },
  {
    name: 'Hassan Raza',
    email: 'hassan@example.com',
    password: 'Customer123!',
    phone: '03021234567',
  },
  {
    name: 'Ahmed Malik',
    email: 'ahmed@example.com',
    password: 'Customer123!',
    phone: '03031234567',
  },
  {
    name: 'Bilal Shah',
    email: 'bilal@example.com',
    password: 'Customer123!',
    phone: '03041234567',
  },
  {
    name: 'Hamza Tariq',
    email: 'hamza@example.com',
    password: 'Customer123!',
    phone: '03051234567',
  },
  {
    name: 'Zain Abbas',
    email: 'zain@example.com',
    password: 'Customer123!',
    phone: '03061234567',
  },
  {
    name: 'Saad Hussain',
    email: 'saad@example.com',
    password: 'Customer123!',
    phone: '03071234567',
  },
  {
    name: 'Fahad Iqbal',
    email: 'fahad@example.com',
    password: 'Customer123!',
    phone: '03081234567',
  },
  {
    name: 'Danish Ali',
    email: 'danish@example.com',
    password: 'Customer123!',
    phone: '03091234567',
  },
  {
    name: 'Ahsan Javed',
    email: 'ahsan@example.com',
    password: 'Customer123!',
    phone: '03101234567',
  },
  {
    name: 'Omar Farooq',
    email: 'omar@example.com',
    password: 'Customer123!',
    phone: '03111234567',
  },
  {
    name: 'Talha Sheikh',
    email: 'talha@example.com',
    password: 'Customer123!',
    phone: '03121234567',
  },
  {
    name: 'Waleed Akram',
    email: 'waleed@example.com',
    password: 'Customer123!',
    phone: '03131234567',
  },
  {
    name: 'Kashif Mehmood',
    email: 'kashif@example.com',
    password: 'Customer123!',
    phone: '03141234567',
  },
  {
    name: 'Rizwan Ahmed',
    email: 'rizwan@example.com',
    password: 'Customer123!',
    phone: '03151234567',
  },
  {
    name: 'Shahzaib Khan',
    email: 'shahzaib@example.com',
    password: 'Customer123!',
    phone: '03161234567',
  },
  {
    name: 'Muneeb Aslam',
    email: 'muneeb@example.com',
    password: 'Customer123!',
    phone: '03171234567',
  },
  {
    name: 'Arslan Butt',
    email: 'arslan@example.com',
    password: 'Customer123!',
    phone: '03181234567',
  },
  {
    name: 'Rehan Siddiqui',
    email: 'rehan@example.com',
    password: 'Customer123!',
    phone: '03191234567',
  },
];

async function seedCustomers() {
  let created = 0;
  let skipped = 0;
  let conflicts = 0;

  try {
    await mongoose.connect(env.MONGO_URI);

    console.log('📦 Connected to MongoDB');
    console.log('🌱 Starting customer seeding...\n');

    for (const customer of customers) {
      const email = customer.email.toLowerCase().trim();

      const existing = await User.findOne({ email });

      if (existing) {
        if (existing.role !== 'customer') {
          console.error(`⚠️  Conflict: ${email} belongs to a ${existing.role} account.`);
          conflicts++;
        } else {
          console.log(`⏭️  Already exists: ${email}`);
          skipped++;
        }

        continue;
      }

      await new User({
        ...customer,
        email,
        role: 'customer',
        authProvider: 'local',
        isEmailVerified: true,
        isActive: true,
      }).save();

      console.log(`✔ Customer created: ${email}`);
      created++;
    }

    console.log('\n========== SEED SUMMARY ==========');
    console.log(`✔ Created:   ${created}`);
    console.log(`⏭️  Skipped:   ${skipped}`);
    console.log(`⚠️  Conflicts: ${conflicts}`);
    console.log('==================================');

    if (conflicts > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('❌ Customer seeding failed:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 MongoDB disconnected');
  }
}

await seedCustomers();
