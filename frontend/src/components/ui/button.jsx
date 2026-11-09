import { cloneElement, isValidElement } from "react";
import { cn } from "@/lib/utils";

const variants = {
  default: "bg-slate-900 text-white hover:bg-slate-700",
  outline: "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50",
  ghost: "text-slate-700 hover:bg-slate-100",
  destructive: "bg-red-600 text-white hover:bg-red-700",
  link: "text-slate-900 underline-offset-4 hover:underline",
  neon: "bg-black-700 text-white hover:bg-black-900",
};

const sizes = {
  default: "h-10 px-4 py-2",
  sm: "h-9 px-3 text-sm",
  lg: "h-11 px-6",
  icon: "h-10 w-10",
};

export function Button({
  className,
  variant = "default",
  size = "default",
  type = "button",
  asChild = false,
  children,
  ...props
}) {
  const classes = cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    sizes[size],
    className
  );

  if (asChild) {
    if (!isValidElement(children)) {
      throw new Error("Button with asChild requires a single valid React element.");
    }
    return cloneElement(children, {
      ...props,
      className: cn(classes, children.props.className),
    });
  }

  return (
    <button type={type} className={classes} {...props}>
      {children}
    </button>
  );
}
