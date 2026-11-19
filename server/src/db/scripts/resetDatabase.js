import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI is missing from .env');
  process.exit(1);
}

async function resetDatabase() {
  try {
    console.log('🔌 Connecting to MongoDB Atlas...');

    await mongoose.connect(MONGO_URI, {
      bufferCommands: false,
    });

    const db = mongoose.connection.db;

    const databaseName = db.databaseName;

    console.log(`\n📦 Database: ${databaseName}`);

    const collections = await db.listCollections().toArray();

    if (collections.length === 0) {
      console.log('Database is already empty.');
      return;
    }

    console.log(`\nFound ${collections.length} collections:`);

    for (const collection of collections) {
      console.log(`   - ${collection.name}`);
    }

    console.log('\n🗑️ Deleting all collections...');

    for (const collection of collections) {
      await db.dropCollection(collection.name);

      console.log(`✅ Dropped: ${collection.name}`);
    }

    console.log('\n✅ Database reset completed successfully.');
    console.log('All documents, collections, and collection indexes removed.');
  } catch (error) {
    console.error('\n❌ Database reset failed:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 MongoDB connection closed.');
  }
}

resetDatabase();
