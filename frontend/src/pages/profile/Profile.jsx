import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Pencil, Mail, Phone, CalendarDays, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Loader from "@/components/common/Loader";
import { authService } from "@/services/auth.service";
import { useAuth } from "@/hooks/useAuth";

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 py-4">
      <div className="rounded-lg bg-slate-100 p-2 text-slate-600"><Icon size={17} /></div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <p className="mt-1 break-words text-sm font-medium text-slate-800">{value || "Not provided"}</p>
      </div>
    </div>
  );
}

export default function Profile() {
  const { user, setUser } = useAuth();
  const [profile, setProfile] = useState(user);
  const [loading, setLoading] = useState(!user);

  useEffect(() => {
    let active = true;
    authService.getProfile()
      .then((result) => {
        if (active) {
          setProfile(result.user);
          setUser(result.user);
        }
      })
      .catch((error) => toast.error(error.message))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [setUser]);

  if (loading) return <Loader label="Loading your profile..." />;

  const initials = (profile?.name || "U").split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <p className="text-sm font-medium text-slate-500">Account</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">My profile</h1>
        <p className="mt-2 text-sm text-slate-500">View and manage your personal information.</p>
      </div>
      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        <Card className="h-fit">
          <CardContent className="flex flex-col items-center p-6 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-900 text-xl font-semibold text-white">{initials}</div>
            <h2 className="mt-4 text-lg font-semibold text-slate-900">{profile?.name}</h2>
            <p className="mt-1 max-w-full break-all text-sm text-slate-500">{profile?.email}</p>
            <Button asChild className="mt-5 w-full" variant="outline">
              <Link to="/profile/edit"><Pencil size={15} /> Edit profile</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Personal information</CardTitle>
            <CardDescription>Your account details and contact information.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-slate-100">
            <InfoRow icon={UserRound} label="Full name" value={profile?.name} />
            <InfoRow icon={Mail} label="Email address" value={profile?.email} />
            <InfoRow icon={Phone} label="Phone number" value={profile?.phone} />
            <InfoRow icon={CalendarDays} label="Member since" value={profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : "—"} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
