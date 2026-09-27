import { ViewTransition } from "react";

// Remounts on every navigation (not on live refreshes), so each new page rises in once.
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="page-enter" exit="page-exit" default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}
