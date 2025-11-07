// /app/components/PressRibbon.tsx
import Image from "next/image";
import Link from "next/link";

const outlets = [
  { name: "CNBC",         src: "/press/cnbc.svg" },
  { name: "Bloomberg",    src: "/press/bloomberg.svg" },
  { name: "Fast Company", src: "/PRESS/FASTCOMPANY.svg" }, // keep your exact path/case
  { name: "TechCrunch",   src: "/press/techcrunch.svg" },
  { name: "Forbes",       src: "/press/forbes.svg" },
];

export default function PressRibbon() {
  return (
    <section className="border-y border-neutral-200 bg-white/90">
      <div className="mx-auto flex max-w-7xl flex-col items-center px-5 py-10">
        {/* Bigger, spread logos */}
        <div className="flex w-full flex-wrap items-center justify-center gap-x-12 gap-y-6 opacity-90">
          {outlets.map((o) => (
            <span key={o.name} className="relative block h-8 w-36">
              <Image
                src={o.src}
                alt={o.name}
                fill
                sizes="144px"
                className="object-contain"
              />
            </span>
          ))}
        </div>

        <div className="mt-8">
          <Link
            href="/press"
            className="inline-block rounded-full border px-6 py-2.5 text-sm font-semibold"
            style={{ color: "#243186", borderColor: "#243186" }}
          >
            Media requests? View our press kit →
          </Link>
        </div>
      </div>
    </section>
  );
}

