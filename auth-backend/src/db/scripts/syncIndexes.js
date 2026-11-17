// server/src/db/scripts/syncIndexes.js   →  "db:indexes": "node src/db/scripts/syncIndexes.js"
import mongoose from 'mongoose';
import env from '../../config/env.js';
import * as models from '../../modules/models.js';

await mongoose.connect(env.MONGO_URI, { autoIndex: false });
for (const [name, Model] of Object.entries(models)) {
  const dropped = await Model.syncIndexes();        // creates missing, drops removed
  console.log(`✔ ${name}: indexes in sync${dropped.length ? ` (dropped ${dropped.join(', ')})` : ''}`);
}
await mongoose.disconnect();
