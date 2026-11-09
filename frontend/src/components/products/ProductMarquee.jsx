
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getProducts } from "@/services/product.service";

let cachedProducts = null;
let cacheTime = 0;
let pendingRequest = null;

const CACHE_DURATION = 5 * 60 * 1000;

function ProductSkeleton() {
  return (
    <div className="w-52 shrink-0 rounded-xl border border-slate-200 bg-white p-3 sm:w-60">
      <div className="h-40 animate-pulse rounded-lg bg-slate-200 sm:h-48" />
      <div className="mt-3 h-4 w-3/4 animate-pulse rounded bg-slate-200" />
      <div className="mt-2 h-4 w-1/2 animate-pulse rounded bg-slate-200" />
    </div>
  );
}

function ProductItem({ product }) {
  const image = product.images?.[0]?.url;

  return (
    <Link
      to={`/product/${product.slug}`}
      className="w-52 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-3 transition-shadow hover:shadow-lg sm:w-60"
    >
      <div className="h-40 overflow-hidden rounded-lg bg-slate-100 sm:h-48">
        {image && (
          <img
            src={image}
            alt={product.images?.[0]?.alt || product.name}
            loading="lazy"
            decoding="async"
            width="240"
            height="192"
            className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
          />
        )}
      </div>

      <div className="mt-3">
        <p className="truncate text-sm font-semibold text-slate-900">
          {product.name}
        </p>

        <p className="mt-1 text-sm font-bold text-slate-600">
          Rs. {Number(product.price).toLocaleString()}
        </p>
      </div>
    </Link>
  );
}

export default function ProductMarquee() {
  const [products, setProducts] = useState(cachedProducts || []);
  const [loading, setLoading] = useState(!cachedProducts);

  useEffect(() => {
    let cancelled = false;

    const loadProducts = async () => {
      if (
        cachedProducts &&
        Date.now() - cacheTime < CACHE_DURATION
      ) {
        setProducts(cachedProducts);
        setLoading(false);
        return;
      }

      try {
        if (!pendingRequest) {
          pendingRequest = getProducts({
            page: 1,
            limit: 6,
            sort: "newest",
          });
        }

        const result = await pendingRequest;

        cachedProducts = result.products || [];
        cacheTime = Date.now();

        if (!cancelled) {
          setProducts(cachedProducts);
        }
      } catch (error) {
        console.error("Failed to load marquee products:", error);
      } finally {
        pendingRequest = null;

        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadProducts();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <section className="w-full overflow-hidden py-8">
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-semibold text-slate-950">
            Products worth exploring.
          </h2>
        </div>

        <div className="flex gap-5 overflow-hidden">
          {[1, 2, 3, 4].map((item) => (
            <ProductSkeleton key={item} />
          ))}
        </div>
      </section>
    );
  }

  if (!products.length) return null;

  return (
    <section className="block w-full min-w-0 overflow-hidden py-8">
      <div className="mb-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Explore our collection
        </p>

        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
          Products worth exploring.
        </h2>
      </div>

      <div className="group relative block w-full min-w-0 overflow-hidden py-2">
        <div className="flex w-max animate-marquee motion-reduce:animate-none group-hover:[animation-play-state:paused]">
          {[0, 1].map((group) => (
            <div
              key={group}
              className="flex shrink-0 gap-5 pr-5"
              aria-hidden={group === 1}
            >
              {products.map((product) => (
                <ProductItem
                  key={`${group}-${product._id}`}
                  product={product}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
