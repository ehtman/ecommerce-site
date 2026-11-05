import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import Loader from "@/components/common/Loader";

export default function GuestRoute() {
  const { user, loading } = useAuth();
  if (loading) return <Loader label="Loading..." />;
  if (user) return <Navigate to="/profile" replace />;
  return <Outlet />;
}
