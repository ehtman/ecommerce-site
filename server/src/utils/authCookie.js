
const getCookieOptions = (maxAge) => ({
  httpOnly: true,
  secure: process.env.COOKIE_SECURE === "true",
  sameSite: "lax",
  path: "/",
  ...(maxAge ? { maxAge } : {}),
});

const setAuthCookie = (res, name, token, expiresInMs) => {
  res.cookie(
    name,
    token,
    getCookieOptions(expiresInMs)
  );
};

const clearAuthCookie = (res, name) => {
  res.clearCookie(name, getCookieOptions());
};

module.exports = {
  setAuthCookie,
  clearAuthCookie,
};
