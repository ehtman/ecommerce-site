
const express = require("express");

const customerRoutes = require("../modules/customers/customer.route");
const staffRoutes = require("../modules/staff/staff.route");

const router = express.Router();

router.use("/customers", customerRoutes);
router.use("/staff", staffRoutes);

module.exports = router;
