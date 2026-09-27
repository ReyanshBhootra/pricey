import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-label="Loading">
      <Skeleton className="h-56 rounded-[1.75rem]" />
      <Skeleton className="h-9 w-3/4 rounded-full" />
      {[0, 1].map((i) => (
        <Skeleton key={i} className="h-44 rounded-[1.5rem]" />
      ))}
    </div>
  );
}
