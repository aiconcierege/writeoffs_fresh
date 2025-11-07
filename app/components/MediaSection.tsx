// /app/components/MediaSection.tsx
import Image from "next/image";

const media = [
  { src: "/media/receipt-capture.png", alt: "Receipt capture" },
  { src: "/media/auto-classify.png", alt: "Auto classification" },
  { src: "/media/export.png", alt: "Schedule C export" },
];

export default function MediaSection() {
  return (
    <section id="media" className="border-t border-neutral-200 py-16">
      <div className="mx-auto max-w-7xl px-5 text-center">
        <h3 className="text-xl font-semibold">Media</h3>
        <p className="mx-auto mt-1 max-w-3xl text-sm text-neutral-600">
          Pre-beta visuals that match how the app feels—clean, calm, and fast.
        </p>

        <div className="mx-auto mt-8 grid max-w-6xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {media.map((m) => (
            <div
              key={m.src}
              className="relative overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-card"
            >
              {/* Graceful fallback: soft brand glow if image isn’t present yet */}
              <div className="relative h-56 w-full bg-[radial-gradient(600px_260px_at_70%_0%,rgba(37,99,235,0.12),transparent)]">
                <Image
                  src={m.src}
                  alt={m.alt}
                  fill
                  sizes="(max-width:768px) 100vw, (max-width:1200px) 50vw, 33vw"
                  className="object-cover"
                  priority={false}
                />
              </div>
              <div className="p-4 text-left">
                <div className="text-sm font-semibold text-neutral-900">{m.alt}</div>
                <div className="mt-1 text-sm text-neutral-700">
                  Crisp UI with audit-ready details and minimal clicks.
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

