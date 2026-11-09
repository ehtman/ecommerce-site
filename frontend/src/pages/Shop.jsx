
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { getProducts } from "@/services/product.service";
import { getCategories } from "@/services/category.service";

import ProductGrid from "@/components/products/ProductGrid";
import Pagination from "@/components/products/Pagination";

export default function Shop() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const page = Number(searchParams.get("page")) || 1;
  const keyword = searchParams.get("keyword") || "";
  const category = searchParams.get("category") || "";
  const sort = searchParams.get("sort") || "newest";

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(console.error);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchProducts = async () => {
      setLoading(true);
      setError("");

      try {
        const params = Object.fromEntries(searchParams.entries());
        const result = await getProducts({
          ...params,
          page,
          limit: 12,
        });

        if (!cancelled) {
          setProducts(result.products);
          setMeta(result.meta);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load products");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchProducts();

    return () => {
      cancelled = true;
    };
  }, [searchParams, page]);

  const updateFilter = (key, value) => {
    const next = new URLSearchParams(searchParams);

    if (value) next.set(key, value);
    else next.delete(key);

    next.set("page", "1");
    setSearchParams(next);
  };

  const clearFilters = () => {
    setSearchParams({});
  };

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Shop</h1>
        <p className="mt-2 text-slate-500">
          Browse our product collection.
        </p>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-4">
        <input
          type="search"
          placeholder="Search products..."
          defaultValue={keyword}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              updateFilter("keyword", event.currentTarget.value.trim());
            }
          }}
          className="rounded-lg border border-slate-300 px-4 py-2"
        />

        <select
          value={category}
          onChange={(event) => updateFilter("category", event.target.value)}
          className="rounded-lg border border-slate-300 px-4 py-2"
        >
          <option value="">All categories</option>
          {categories.map((item) => (
            <option key={item._id} value={item.slug}>
              {item.name}
            </option>
          ))}
        </select>

        <select
          value={sort}
          onChange={(event) => updateFilter("sort", event.target.value)}
          className="rounded-lg border border-slate-300 px-4 py-2"
        >
          <option value="newest">Newest</option>
          <option value="price_asc">Price: Low to High</option>
          <option value="price_desc">Price: High to Low</option>
          <option value="rating">Top Rated</option>
          <option value="popular">Popular</option>
        </select>

        <button
          onClick={clearFilters}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium"
        >
          Clear filters
        </button>
      </div>

      {error ? (
        <p className="py-10 text-center text-red-600">{error}</p>
      ) : (
        <>
          <ProductGrid products={products} loading={loading} />

          <Pagination
            page={meta.page || 1}
            pages={meta.pages || 1}
            onPageChange={(nextPage) => updateFilter("page", String(nextPage))}
          />
        </>
      )}
    </main>
  );
}
