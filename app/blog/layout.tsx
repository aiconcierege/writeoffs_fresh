// app/blog/layout.tsx
import type { ReactNode } from "react";

export default function BlogLayout({ children }: { children: ReactNode }) {
  // Inherit the root header/footer; DO NOT render another header here.
  return <>{children}</>;
}
