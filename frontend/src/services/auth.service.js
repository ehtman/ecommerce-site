import api from "./api";

export const authService = {
  register: async (payload) => (await api.post("/users/register", payload)).data,
  login: async (payload) => (await api.post("/users/login", payload)).data,
  logout: async () => (await api.post("/users/logout")).data,
  forgotPassword: async (email) =>
    (await api.post("/users/forgot-password", { email })).data,
  resetPassword: async (token, password) =>
    (await api.post(`/users/reset-password/${encodeURIComponent(token)}`, { password })).data,
  getProfile: async () => (await api.get("/users/profile")).data,
  updateProfile: async (payload) => (await api.patch("/users/profile", payload)).data,
};
