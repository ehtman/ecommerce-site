
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";

export default function ProductCard({ product }) {
  const image = product.images?.[0]?.url;

  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <Link to={`/product/${product.slug}`}>
        <div className="aspect-square bg-slate-100">
          {image ? (
            <img
              src={image}
              alt={product.images?.[0]?.alt || product.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-slate-400">
              No image
            </div>
          )}
        </div>
      </Link>

      <div className="space-y-2 p-4">
        <p className="text-xs text-slate-500">
          {product.category?.name}
        </p>

        <Link
          to={`/product/${product.slug}`}
          className="line-clamp-2 font-semibold text-slate-900 hover:text-slate-600"
        >
          {product.name}
        </Link>

        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-900">
            Rs. {product.price.toLocaleString()}
          </span>

          <span className="text-sm text-slate-500">
            ⭐ {product.ratingAverage?.toFixed(1) || "0.0"}
          </span>
        </div>

        {product.stock > 0 ? (
          <Button className="w-full">
            <Link to={`/product/${product.slug}`}>
              View product
            </Link>
          </Button>
        ) : (
          <>
            <span className="text-sm font-medium text-red-600">
              Out of stock
            </span>
            <Button className="w-full" disabled>
              Out of stock
            </Button>
          </>
        )}
      </div>
    </article>
  );
}
