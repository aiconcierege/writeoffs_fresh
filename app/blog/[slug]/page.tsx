// app/blog/[slug]/page.tsx
import type { Metadata } from "next";

type Params = Promise<{ slug: string }>;

export async function generateMetadata(
  { params }: { params: Params }
): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Blog – ${slug}` };
}

export default async function Page(
  { params }: { params: Params }
) {
  const { slug } = await params;
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold">Blog: {slug}</h1>
      <p className="mt-4 text-neutral-600">
        This post will be published soon.
      </p>
    </main>
  );
}

