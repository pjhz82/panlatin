import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function Encabezado({
  titulo,
  descripcion,
  acciones,
}: {
  titulo: string;
  descripcion?: ReactNode;
  acciones?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{titulo}</h1>
        {descripcion && <p className="mt-1 text-sm text-slate-500">{descripcion}</p>}
      </div>
      {acciones && <div className="flex gap-2">{acciones}</div>}
    </div>
  );
}

export function Tarjeta({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  );
}

const estilosBoton = {
  primario: "bg-slate-900 text-white hover:bg-slate-700",
  secundario: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  peligro: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
};

export function BotonEnlace({
  href,
  children,
  variante = "primario",
}: {
  href: string;
  children: ReactNode;
  variante?: keyof typeof estilosBoton;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center rounded-lg px-3.5 py-2 text-sm font-medium transition ${estilosBoton[variante]}`}
    >
      {children}
    </Link>
  );
}

export function Boton({
  variante = "primario",
  className = "",
  ...props
}: ComponentProps<"button"> & { variante?: keyof typeof estilosBoton }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:opacity-50 ${estilosBoton[variante]} ${className}`}
    />
  );
}

export function Insignia({
  children,
  color = "gris",
}: {
  children: ReactNode;
  color?: "gris" | "verde" | "rojo" | "azul" | "ambar";
}) {
  const colores = {
    gris: "bg-slate-100 text-slate-700",
    verde: "bg-emerald-50 text-emerald-700",
    rojo: "bg-red-50 text-red-700",
    azul: "bg-sky-50 text-sky-700",
    ambar: "bg-amber-50 text-amber-800",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colores[color]}`}>
      {children}
    </span>
  );
}

export function EstadoActivo({ activo }: { activo: boolean }) {
  return activo ? <Insignia color="verde">Activo</Insignia> : <Insignia>Inactivo</Insignia>;
}

export function Tabla({ children }: { children: ReactNode }) {
  return (
    <Tarjeta className="overflow-x-auto">
      <table className="w-full text-left text-sm">{children}</table>
    </Tarjeta>
  );
}

export function Th({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={`border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <td className={`border-b border-slate-100 px-4 py-2.5 ${className}`}>{children}</td>;
}

export function FilaVacia({ columnas, texto }: { columnas: number; texto: string }) {
  return (
    <tr>
      <td colSpan={columnas} className="px-4 py-10 text-center text-sm text-slate-500">
        {texto}
      </td>
    </tr>
  );
}

export function Campo({
  etiqueta,
  error,
  ayuda,
  children,
}: {
  etiqueta: string;
  error?: string;
  ayuda?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{etiqueta}</span>
      {children}
      {ayuda && !error && <span className="mt-1 block text-xs text-slate-500">{ayuda}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

const estiloEntrada =
  "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200";

export function Entrada(props: ComponentProps<"input">) {
  return <input {...props} className={`${estiloEntrada} ${props.className ?? ""}`} />;
}

export function Selector(props: ComponentProps<"select">) {
  return <select {...props} className={`${estiloEntrada} ${props.className ?? ""}`} />;
}

export function AreaTexto(props: ComponentProps<"textarea">) {
  return <textarea {...props} className={`${estiloEntrada} ${props.className ?? ""}`} />;
}

export function Casilla({ etiqueta, ...props }: ComponentProps<"input"> & { etiqueta: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" {...props} className="h-4 w-4 rounded border-slate-300" />
      {etiqueta}
    </label>
  );
}

export function Aviso({ children, tipo = "error" }: { children: ReactNode; tipo?: "error" | "info" }) {
  const estilos =
    tipo === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-sky-200 bg-sky-50 text-sky-800";
  return <div className={`rounded-lg border px-3 py-2 text-sm ${estilos}`}>{children}</div>;
}
