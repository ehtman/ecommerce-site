import { Link, useNavigate } from "react-router-dom";
import { LogOut, UserRound, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      toast.success("You have been logged out.");
      navigate("/login", { replace: true });
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white"><ShoppingBag size={17} /></span>
          Commerce
        </Link>
        <nav className="flex items-center gap-2">
          {user ? (
            <>
              <Link to="/profile" className="hidden items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 sm:flex">
                <UserRound size={16} /> My account
              </Link>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut size={15} /> <span className="hidden sm:inline">Logout</span>
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/login">Sign in</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link to="/register">Create account</Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
