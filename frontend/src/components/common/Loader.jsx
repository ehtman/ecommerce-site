export default function Loader({ label = "Loading..." }) {
  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center gap-3 text-sm text-slate-500">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
      {label}
    </div>
  );
}
