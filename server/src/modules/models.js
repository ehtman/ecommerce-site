/**
 * src/modules/models.js – one place to import every Mongoose model from.
 *
 * WHY: Other files write `import { User } from '../models.js'` instead of remembering
 *      each model's folder. Each new module (branch) adds its model to this list.
 *      db/scripts/syncIndexes.js also loops over this list to build all indexes.
 */
export { default as User } from './users/user.model.js';
export { default as Address } from './addresses/address.model.js';
export { default as Category } from './categories/category.model.js';
export { default as Product } from './products/product.model.js';
export { default as Cart } from './cart/cart.model.js';
export { default as Wishlist } from './wishlist/wishlist.model.js';
export { default as Coupon } from './coupons/coupon.model.js';
// Branch 07
export { default as Order } from './orders/order.model.js';
