
import { getUserProfile } from "./user.service.js";

export const getProfile = async (req, res, next) => {
  try {
    const user = await getUserProfile(req.user._id);

    res.status(200).json({
      success: true,
      message: "Profile retrieved successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};
