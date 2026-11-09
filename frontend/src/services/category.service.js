
import api from "@/lib/api";

export const getCategories = async () => {
  const { data } = await api.get("/categories");
  return data.categories;
};

export const getCategoryBySlug = async (slug) => {
  const { data } = await api.get(`/categories/${slug}`);
  return data.category;
};
