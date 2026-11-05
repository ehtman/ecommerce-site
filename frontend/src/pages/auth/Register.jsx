import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { toast } from "sonner";
import AuthLayout from "@/components/auth/AuthLayout";
import FormField from "@/components/common/FormField";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

const schema = z.object({
  name: z.string().trim().min(2, "Name must contain at least 2 characters.").max(50),
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Password must contain at least 8 characters."),
  confirmPassword: z.string().min(1, "Please confirm your password."),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
});

export default function Register() {
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });

  const onSubmit = async ({ confirmPassword, ...values }) => {
    setSubmitting(true);
    try {
      await registerUser(values);
      toast.success("Your account has been created.");
      navigate("/profile", { replace: true });
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      description="Enter your details to get started."
      footer={<>Already have an account? <Link className="font-medium text-slate-900 hover:underline" to="/login">Sign in</Link></>}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormField id="name" label="Full name" autoComplete="name" placeholder="Ahmad Raza" error={errors.name?.message} {...register("name")} />
        <FormField id="email" label="Email address" type="email" autoComplete="email" placeholder="you@example.com" error={errors.email?.message} {...register("email")} />
        <FormField id="password" label="Password" type="password" autoComplete="new-password" placeholder="At least 8 characters" error={errors.password?.message} {...register("password")} />
        <FormField id="confirmPassword" label="Confirm password" type="password" autoComplete="new-password" placeholder="Re-enter your password" error={errors.confirmPassword?.message} {...register("confirmPassword")} />
        <Button type="submit" className="w-full" disabled={submitting}>{submitting ? "Creating account..." : "Create account"}</Button>
      </form>
    </AuthLayout>
  );
}
