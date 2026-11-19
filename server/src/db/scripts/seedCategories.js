/**
 * src/db/scripts/seedCategories.js – creates default shop categories.
 *
 * Run: npm run seed:categories
 *
 * Creates 20 top-level categories.
 * Idempotent: existing categories are not duplicated or overwritten.
 */
import mongoose from 'mongoose';
import env from '../../config/env.js';
import Category from '../../modules/categories/category.model.js';

const categories = [
  {
    name: 'Electronics',
    description: 'Electronic devices, gadgets and accessories.',
    sortOrder: 1,
  },
  {
    name: 'Fashion',
    description: 'Clothing and fashion products for everyone.',
    sortOrder: 2,
  },
  {
    name: 'Footwear',
    description: 'Shoes, sandals and everyday footwear.',
    sortOrder: 3,
  },
  {
    name: 'Home and Living',
    description: 'Home decoration and household products.',
    sortOrder: 4,
  },
  {
    name: 'Beauty and Personal Care',
    description: 'Beauty, skincare and personal care products.',
    sortOrder: 5,
  },
  {
    name: 'Sports and Fitness',
    description: 'Sports equipment and fitness accessories.',
    sortOrder: 6,
  },
  {
    name: 'Books and Stationery',
    description: 'Books, educational materials and stationery.',
    sortOrder: 7,
  },
  {
    name: 'Grocery',
    description: 'Food, beverages and household essentials.',
    sortOrder: 8,
  },
  {
    name: 'Toys and Games',
    description: 'Toys, games and entertainment products.',
    sortOrder: 9,
  },
  {
    name: 'Automotive',
    description: 'Automotive accessories and vehicle essentials.',
    sortOrder: 10,
  },
  {
    name: 'Health and Wellness',
    description: 'Health, wellness and everyday care products.',
    sortOrder: 11,
  },
  {
    name: 'Jewelry and Watches',
    description: 'Jewelry, watches and fashion accessories.',
    sortOrder: 12,
  },
  {
    name: 'Baby Products',
    description: 'Baby care, clothing and essential products.',
    sortOrder: 13,
  },
  {
    name: 'Pet Supplies',
    description: 'Pet food, accessories and care products.',
    sortOrder: 14,
  },
  {
    name: 'Office Supplies',
    description: 'Office equipment and workplace essentials.',
    sortOrder: 15,
  },
  {
    name: 'Gaming',
    description: 'Gaming consoles, accessories and equipment.',
    sortOrder: 16,
  },
  {
    name: 'Musical Instruments',
    description: 'Musical instruments and audio accessories.',
    sortOrder: 17,
  },
  {
    name: 'Travel and Luggage',
    description: 'Travel accessories, bags and luggage.',
    sortOrder: 18,
  },
  {
    name: 'Outdoor and Garden',
    description: 'Outdoor equipment and gardening products.',
    sortOrder: 19,
  },
  {
    name: 'Kitchen and Dining',
    description: 'Kitchen appliances, cookware and dining essentials.',
    sortOrder: 20,
  },
];

async function seedCategories() {
  let created = 0;
  let existing = 0;

  try {
    await mongoose.connect(env.MONGO_URI);

    console.log('\n🌱 Starting category seeder...\n');

    for (const categoryData of categories) {
      const category = await Category.findOne({
        name: categoryData.name,
        parent: null,
      }).collation({ locale: 'en', strength: 2 });

      if (category) {
        existing++;
        console.log(`↪ Already exists: ${category.name}`);
        continue;
      }

      const newCategory = await new Category({
        ...categoryData,
        parent: null,
      }).save();

      created++;
      console.log(`✔ Created: ${newCategory.name}`);
    }

    console.log('\n================================');
    console.log('       CATEGORY SEED SUMMARY');
    console.log('================================');
    console.log(`Total configured:  ${categories.length}`);
    console.log(`Created:           ${created}`);
    console.log(`Already existing:  ${existing}`);
    console.log('================================\n');
  } catch (error) {
    console.error('\n❌ Category seeding failed:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

await seedCategories();
