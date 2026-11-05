import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export default function FormField({ id, label, error, ...inputProps }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} aria-invalid={Boolean(error)} {...inputProps} />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
