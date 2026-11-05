
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";

export default function Navbar() {
  const { user, logout } = useAuth();

  return (
    <header className="border-b border-slate-200 bg-white">
      <nav className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
        <Link
          to="/"
          className="text-xl font-bold text-slate-900"
        >
          Ecommerce
        </Link>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <Button variant="outline" asChild>
                <Link to="/profile">Profile</Link>
              </Button>

              <Button onClick={logout}>
                Logout
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" asChild>
                <Link to="/login">Sign in</Link>
              </Button>

              <Button asChild>
                <Link to="/register">Create account</Link>
              </Button>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
