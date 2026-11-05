import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import FormField from "@/components/common/FormField";
import Loader from "@/components/common/Loader";
import { authService } from "@/services/auth.service";
import { useAuth } from "@/hooks/useAuth";

const schema = z.object({
  name: z.string().trim().min(2, "Name must contain at least 2 characters.").max(50),
  phone: z.string().trim().max(20, "Phone number cannot exceed 20 characters."),
});

export default function EditProfile() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(!user);
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: user?.name || "", phone: user?.phone || "" },
  });

  useEffect(() => {
    let active = true;
    authService.getProfile()
      .then(({ user: currentUser }) => {
        if (active) {
          setUser(currentUser);
          reset({ name: currentUser.name || "", phone: currentUser.phone || "" });
        }
      })
      .catch((error) => toast.error(error.message))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reset, setUser]);

  const onSubmit = async (values) => {
    setSubmitting(true);
    try {
      const result = await authService.updateProfile(values);
      setUser(result.user);
      toast.success(result.message || "Profile updated.");
      navigate("/profile");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Loader label="Loading profile..." />;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Link to="/profile" className="mb-6 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft size={15} /> Back to profile</Link>
      <Card>
        <CardHeader>
          <CardTitle>Edit profile</CardTitle>
          <CardDescription>Update the name and phone number associated with your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <FormField id="name" label="Full name" autoComplete="name" error={errors.name?.message} {...register("name")} />
            <FormField id="email" label="Email address" type="email" value={user?.email || ""} disabled />
            <FormField id="phone" label="Phone number" type="tel" autoComplete="tel" placeholder="03001234567" error={errors.phone?.message} {...register("phone")} />
            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
              <Button asChild variant="outline"><Link to="/profile">Cancel</Link></Button>
              <Button type="submit" disabled={submitting}>{submitting ? "Saving..." : "Save changes"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
