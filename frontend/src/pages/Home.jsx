
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ShieldCheck,
  UserRound,
  ShoppingBag,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import ProductMarquee from "@/components/products/ProductMarquee";

export default function Home() {
  const { user } = useAuth();

  return (
    <main className="mx-auto flex min-h-[75vh] w-full max-w-7xl flex-col items-stretch gap-12 px-4 py-16 sm:px-6">

      {/* HERO SECTION */}
      <section className="w-full max-w-2xl shrink-0">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
          <ShieldCheck size={14} />
          Simple, secure customer accounts
        </div>

        <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-6xl">
          Everything you need, in one place.
        </h1>

        <p className="mt-6 max-w-xl text-base leading-7 text-slate-500">
          Create an account to manage your customer profile and access your
          ecommerce experience.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          {user ? (
            <Button asChild variant="outline" size="lg">
              <Link to="/profile">
                Go to your profile
                <ArrowRight size={16} />
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="outline" size="lg">
                <Link to="/register">
                  Create an account
                  <ArrowRight size={16} />
                </Link>
              </Button>

              <Button asChild variant="outline" size="lg">
                <Link to="/login">
                  <UserRound size={16} />
                  Sign in
                </Link>
              </Button>
            </>
          )}
        </div>
      </section>

 
      { (
        <section className="w-full min-w-0">
          <ProductMarquee />

          {/* SHOP NOW BUTTON */}
          <div className="mt-8 flex justify-center">
            <Button asChild variant="outline " size="lg">
              <Link to="/shop">
                <ShoppingBag size={18} />
                Shop Now
                <ArrowRight size={16} />
              </Link>
            </Button>
          </div>
        </section>
      )}
    </main>
  );
}
