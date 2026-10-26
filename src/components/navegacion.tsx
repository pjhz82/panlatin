"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type EnlaceNav = { href: string; texto: string };

export function Navegacion({ enlaces }: { enlaces: EnlaceNav[] }) {
  const ruta = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col">
      {enlaces.map(({ href, texto }) => {
        const activo = href === "/" || href === "/portal" ? ruta === href : ruta.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
              activo ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
            }`}
          >
            {texto}
          </Link>
        );
      })}
    </nav>
  );
}
