/**
 * src/modules/models.js – one place to import every Mongoose model from.
 *
 * WHY: Other files write `import { User } from '../models.js'` instead of remembering
 *      each model's folder. Each new module (branch) adds its model to this list.
 *      db/scripts/syncIndexes.js also loops over this list to build all indexes.
 */
export { default as User } from './users/user.model.js';
export { default as Address } from './addresses/address.model.js';
