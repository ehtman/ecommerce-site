import { Link, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useState } from "react";
import AuthLayout from "@/components/auth/AuthLayout";
import FormField from "@/components/common/FormField";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values) => {
    setSubmitting(true);
    try {
      await login(values);
      toast.success("Welcome back.");
      navigate(location.state?.from?.pathname || "/profile", { replace: true });
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      description="Sign in to access your customer account."
      footer={<>Don't have an account? <Link className="font-medium text-slate-900 hover:underline" to="/register">Create one</Link></>}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <FormField id="email" label="Email address" type="email" autoComplete="email" placeholder="you@example.com" error={errors.email?.message} {...register("email")} />
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium text-slate-700">Password</label>
            <Link to="/forgot-password" className="text-xs font-medium text-slate-600 hover:text-slate-950 hover:underline">Forgot password?</Link>
          </div>
          <input id="password" type="password" autoComplete="current-password" placeholder="Enter your password" aria-invalid={Boolean(errors.password)} className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100" {...register("password")} />
          {errors.password && <p className="text-xs text-red-600">{errors.password.message}</p>}
        </div>
        <Button type="submit" className="w-full" disabled={submitting}>{submitting ? "Signing in..." : "Sign in"}</Button>
      </form>
    </AuthLayout>
  );
}
