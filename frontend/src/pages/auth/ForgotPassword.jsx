import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { toast } from "sonner";
import AuthLayout from "@/components/auth/AuthLayout";
import FormField from "@/components/common/FormField";
import { Button } from "@/components/ui/button";
import { authService } from "@/services/auth.service";

const schema = z.object({ email: z.string().trim().email("Enter a valid email address.") });

export default function ForgotPassword() {
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  const onSubmit = async ({ email }) => {
    setSubmitting(true);
    try {
      const result = await authService.forgotPassword(email);
      setSent(true);
      toast.success(result.message || "If the account exists, a reset email has been sent.");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout title="Forgot your password?" description="Enter your account email and we'll send you a password reset link." footer={<Link className="font-medium text-slate-900 hover:underline" to="/login">Back to sign in</Link>}>
      {sent ? (
        <div className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">✓</div>
          <h2 className="font-semibold text-slate-900">Check your email</h2>
          <p className="text-sm leading-6 text-slate-500">If an account exists with that address, a reset link has been sent. For local development, check your Mailpit inbox.</p>
          <Button variant="outline" className="w-full" onClick={() => setSent(false)}>Send another request</Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <FormField id="email" label="Email address" type="email" placeholder="you@example.com" error={errors.email?.message} {...register("email")} />
          <Button type="submit" className="w-full" disabled={submitting}>{submitting ? "Sending..." : "Send reset link"}</Button>
        </form>
      )}
    </AuthLayout>
  );
}
