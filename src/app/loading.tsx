export default function Loading() {
  return (
    <div className="animate-pulse space-y-3" aria-label="Loading">
      <div className="h-7 w-2/3 rounded-md bg-muted" />
      <div className="h-4 w-1/2 rounded-md bg-muted" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-36 rounded-xl bg-muted" />
      ))}
    </div>
  );
}
