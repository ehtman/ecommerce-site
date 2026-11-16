
import { ROLE_PERMISSIONS } from "../config/permissions.js";

const authorize = (...requiredPermissions) => {
  return (req, res, next) => {
    // Authentication must run first
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const userRole = req.user.role;

    const userPermissions = ROLE_PERMISSIONS[userRole];

    if (!userPermissions) {
      return res.status(403).json({
        success: false,
        message: "Invalid user role",
      });
    }

    // Check whether user has every required permission
    const hasPermission = requiredPermissions.every(
      (permission) => userPermissions.includes(permission)
    );

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions",
      });
    }

    next();
  };
};

export default authorize;
