/**
 * src/db/scripts/syncIndexes.js – makes the database indexes match the schemas.
 * Run: `npm run db:indexes` (once after deploying, and after changing indexes).
 *
 * In development Mongoose builds indexes on start (autoIndex). In production we turn that
 * off (see config/db.js) and run this script on purpose, because building indexes on a
 * large collection is slow. syncIndexes() creates missing ones and drops removed ones.
 */
import mongoose from 'mongoose';
import env from '../../config/env.js';
import * as models from '../../modules/models.js';

await mongoose.connect(env.MONGO_URI, { autoIndex: false });
for (const [name, Model] of Object.entries(models)) {
  const dropped = await Model.syncIndexes(); // returns names of indexes it removed
  console.log(
    `✔ ${name}: indexes in sync${dropped.length ? ` (dropped ${dropped.join(', ')})` : ''}`,
  );
}
await mongoose.disconnect();
