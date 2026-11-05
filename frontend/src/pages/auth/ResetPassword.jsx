import { Link, useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { toast } from "sonner";
import AuthLayout from "@/components/auth/AuthLayout";
import FormField from "@/components/common/FormField";
import { Button } from "@/components/ui/button";
import { authService } from "@/services/auth.service";

const schema = z.object({
  password: z.string().min(8, "Password must contain at least 8 characters."),
  confirmPassword: z.string().min(1, "Please confirm your password."),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
});

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onSubmit = async ({ password }) => {
    setSubmitting(true);
    try {
      const result = await authService.resetPassword(token, password);
      toast.success(result.message || "Password reset successfully.");
      navigate("/login", { replace: true });
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout title="Set a new password" description="Choose a new password for your account." footer={<Link className="font-medium text-slate-900 hover:underline" to="/login">Back to sign in</Link>}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormField id="password" label="New password" type="password" autoComplete="new-password" placeholder="At least 8 characters" error={errors.password?.message} {...register("password")} />
        <FormField id="confirmPassword" label="Confirm new password" type="password" autoComplete="new-password" placeholder="Re-enter your password" error={errors.confirmPassword?.message} {...register("confirmPassword")} />
        <Button type="submit" className="w-full" disabled={submitting}>{submitting ? "Updating..." : "Reset password"}</Button>
      </form>
    </AuthLayout>
  );
}
