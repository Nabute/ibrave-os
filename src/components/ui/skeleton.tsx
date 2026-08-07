import { cn } from "@/lib/utils";

/** Ledger shimmer block, the only loading primitive. Size it with classes. */
export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div aria-hidden className={cn("shimmer rounded-md", className)} style={style} />;
}
