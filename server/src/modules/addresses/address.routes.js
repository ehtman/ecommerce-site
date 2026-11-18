/**
 * src/modules/addresses/address.routes.js – the URL map of the addresses module.
 * Mounted in app.js under /api/addresses.
 *
 * Every route runs this pipeline, left to right:
 *   protect (who are you?) → authorize('customer') (customers only) →
 *   validateObjectId (is :id a real id?) → validate (is the body OK?) → controller
 *
 * Admins get 403 here: addresses are a customer feature. (Admins will see a customer's
 * details in the admin module, branch 10.) Ownership of each address is checked in the
 * SERVICE, because only the database knows who owns address X.
 */
import { Router } from 'express';
import { protect, authorize } from '../../middleware/auth.middleware.js';
import { validate, validateObjectId } from '../../middleware/validate.middleware.js';
import { ROLES } from '../../config/constants.js';
import * as c from './address.controller.js';
import { addressRules } from './address.validation.js';

const router = Router();

// Applies to EVERY route below: logged in AND role customer
router.use(protect, authorize(ROLES.CUSTOMER));

router.get('/', c.list);
router.post('/', validate(addressRules), c.create);
router.put('/:id', validateObjectId('id'), validate(addressRules), c.update);
router.delete('/:id', validateObjectId('id'), c.remove);
// PATCH = change PART of a resource; here only its "default" flag
router.patch('/:id/default', validateObjectId('id'), c.setDefault);

export default router;
