
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { getProductBySlug } from "@/services/product.service";
import { Button } from "@/components/ui/Button";

export default function ProductDetails() {
  const { slug } = useParams();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadProduct = async () => {
      try {
        const result = await getProductBySlug(slug);
        if (!cancelled) setProduct(result);
      } catch (err) {
        if (!cancelled) setError(err.message || "Product not found");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadProduct();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return <div className="p-10 text-center">Loading product...</div>;
  }

  if (error || !product) {
    return (
      <div className="p-20 text-center">
        <h1 className="text-2xl font-bold">Product not found</h1>
        <p className="mt-2 text-slate-500">
          This product may have been removed or is unavailable.
        </p>
      </div>
    );
  }

  const image = product.images?.[0]?.url;

  return (
    <main className="mx-auto grid max-w-7xl gap-10 px-6 py-12 md:grid-cols-2">
      <div className="aspect-square overflow-hidden rounded-xl bg-slate-100">
        {image && (
          <img
            src={image}
            alt={product.name}
            className="h-full w-full object-cover"
          />
        )}
      </div>

      <div className="space-y-5">
        <p className="text-sm text-slate-500">
          {product.category?.name}
        </p>

        <h1 className="text-3xl font-bold">{product.name}</h1>

        <p className="text-sm text-slate-500">
          Brand: {product.brand || "Not specified"}
        </p>

        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold">
            Rs. {product.price.toLocaleString()}
          </span>

          {product.compareAtPrice > product.price && (
            <span className="text-slate-400 line-through">
              Rs. {product.compareAtPrice.toLocaleString()}
            </span>
          )}
        </div>

        <p className="text-sm text-slate-600">
          ⭐ {product.ratingAverage.toFixed(1)} ({product.ratingCount} reviews)
        </p>

        <p className="leading-7 text-slate-600">
          {product.description}
        </p>

        <p className="font-medium">
          {product.stock > 0
            ? `${product.stock} items available`
            : "Out of stock"}
        </p>

        <Button disabled={product.stock === 0}>
          {product.stock > 0 ? "Add to cart" : "Out of stock"}
        </Button>

        {product.specifications &&
          Object.keys(product.specifications).length > 0 && (
            <div className="border-t pt-5">
              <h2 className="mb-3 font-semibold">Specifications</h2>

              {Object.entries(product.specifications).map(([key, value]) => (
                <div
                  key={key}
                  className="flex justify-between border-b py-2 text-sm"
                >
                  <span className="text-slate-500">{key}</span>
                  <span>{String(value)}</span>
                </div>
              ))}
            </div>
          )}
      </div>
    </main>
  );
}
