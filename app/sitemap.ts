import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const now = new Date().toISOString();

  const routes = [
    "", "blog",
    "blog/starting-a-business-checklist",
    "blog/overlooked-deductions-gig-drivers",
    "blog/home-office-deduction-guide",
    "waitlist",
    "legal/privacy",
    "legal/terms",
    "legal/tax-disclaimer",
  ];

  return routes.map((r) => ({
    url: `${base}/${r}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: r === "" ? 1 : 0.7,
  }));
}
