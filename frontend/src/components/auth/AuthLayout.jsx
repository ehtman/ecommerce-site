import { Link } from "react-router-dom";
import { ShoppingBag } from "lucide-react";

export default function AuthLayout({ title, description, children, footer }) {
  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white"><ShoppingBag size={18} /></span>
            Commerce
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          {children}
        </div>
        {footer && <div className="mt-6 text-center text-sm text-slate-500">{footer}</div>}
      </div>
    </main>
  );
}
