import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { ejecutivos } from "@/db/schema";
import { Boton, BotonEnlace, Encabezado, Entrada, FilaVacia, Insignia, Selector, Tabla, Td, Th } from "@/components/ui";
import type { RiesgoCliente } from "@/db/schema";
import { RIESGOS } from "@/lib/riesgo";
import { requerirUsuario } from "@/lib/auth";
import { puedeEditarClientes } from "@/lib/alcance";
import { saldosSubcuentas } from "@/lib/datos";
import { fechaCorta, importe } from "@/lib/dinero";

export const metadata = { title: "Clientes" };

type Orden = "nombre" | "cobrar" | "favor" | "reciente";

export default async function PaginaClientes({ searchParams }: PageProps<"/clientes">) {
  const usuario = await requerirUsuario(["admin", "ejecutivo", "operadora"]);
  const p = await searchParams;
  const q = typeof p.q === "string" ? p.q.trim().toLowerCase() : "";
  const ejecutivo = typeof p.ejecutivo === "string" ? p.ejecutivo : "";
  const orden: Orden = ["cobrar", "favor", "reciente"].includes(String(p.orden)) ? (p.orden as Orden) : "nombre";

  const [subs, listaEjecutivos] = await Promise.all([
    saldosSubcuentas(usuario),
    usuario.rol === "ejecutivo" ? Promise.resolve([]) : db.select().from(ejecutivos).orderBy(asc(ejecutivos.codigo)),
  ]);

  // Agrupar subcuentas visibles por cliente.
  const porCliente = new Map<number, { id: number; nombre: string; riesgo: RiesgoCliente; ejecutivos: Set<string>; subcuentas: number; saldo: number; ultimo: string | null; coincide: boolean }>();
  for (const s of subs) {
    if (ejecutivo && s.ejecutivo !== ejecutivo) continue;
    const c = porCliente.get(s.clienteId) ?? { id: s.clienteId, nombre: s.cliente, riesgo: s.riesgo, ejecutivos: new Set(), subcuentas: 0, saldo: 0, ultimo: null, coincide: false };
    c.subcuentas++;
    c.saldo += s.saldo;
    if (s.ejecutivo) c.ejecutivos.add(s.ejecutivo);
    if (s.ultimo && (!c.ultimo || s.ultimo > c.ultimo)) c.ultimo = s.ultimo;
    if (!q || s.nombre.toLowerCase().includes(q) || s.cliente.toLowerCase().includes(q)) c.coincide = true;
    porCliente.set(s.clienteId, c);
  }
  const filas = [...porCliente.values()].filter((c) => c.coincide);
  const ordenar: Record<Orden, (a: (typeof filas)[0], b: (typeof filas)[0]) => number> = {
    nombre: (a, b) => a.nombre.localeCompare(b.nombre, "es"),
    cobrar: (a, b) => a.saldo - b.saldo,
    favor: (a, b) => b.saldo - a.saldo,
    reciente: (a, b) => (b.ultimo ?? "").localeCompare(a.ultimo ?? ""),
  };
  filas.sort(ordenar[orden]);
  const porCobrar = filas.reduce((t, c) => t + Math.min(0, c.saldo), 0);
  const aFavor = filas.reduce((t, c) => t + Math.max(0, c.saldo), 0);

  return (
    <>
      <Encabezado
        titulo={usuario.rol === "ejecutivo" ? "Mis clientes" : "Clientes"}
        descripcion={
          <>
            {filas.length} clientes · por cobrar <span className="text-red-700">{importe(-porCobrar)}</span> · a favor de
            clientes <span className="text-sky-700">{importe(aFavor)}</span> (US$)
          </>
        }
        acciones={puedeEditarClientes(usuario) && <BotonEnlace href="/clientes/nuevo">Nuevo cliente</BotonEnlace>}
      />
      <form className="mb-4 flex flex-wrap gap-2">
        <Entrada name="q" defaultValue={q} placeholder="Buscar cliente o subcuenta…" className="max-w-xs" />
        {listaEjecutivos.length > 0 && (
          <Selector name="ejecutivo" defaultValue={ejecutivo} className="max-w-48">
            <option value="">Todos los ejecutivos</option>
            {listaEjecutivos.map((e) => (
              <option key={e.id} value={e.codigo}>
                {e.codigo}
              </option>
            ))}
          </Selector>
        )}
        <Selector name="orden" defaultValue={orden} className="max-w-52">
          <option value="nombre">Ordenar por nombre</option>
          <option value="cobrar">Más por cobrar primero</option>
          <option value="favor">Más a favor primero</option>
          <option value="reciente">Movimiento más reciente</option>
        </Selector>
        <Boton type="submit" variante="secundario">
          Aplicar
        </Boton>
      </form>
      <Tabla>
        <thead>
          <tr>
            <Th>Cliente</Th>
            <Th>Ejecutivo</Th>
            <Th className="text-right">Subcuentas</Th>
            <Th className="text-right">Saldo US$</Th>
            <Th>Último mov.</Th>
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 && <FilaVacia columnas={5} texto="No hay clientes que coincidan." />}
          {filas.map((c) => (
            <tr key={c.id} className="hover:bg-slate-50">
              <Td>
                <Link href={`/clientes/${c.id}`} className="font-medium hover:underline">
                  {c.nombre}
                </Link>
                {c.riesgo !== "normal" && (
                  <span className="ml-2">
                    <Insignia color={RIESGOS[c.riesgo].color}>{RIESGOS[c.riesgo].nombre}</Insignia>
                  </span>
                )}
              </Td>
              <Td>{[...c.ejecutivos].join(", ") || "—"}</Td>
              <Td className="text-right tabular-nums">{c.subcuentas}</Td>
              <Td className={`text-right tabular-nums ${c.saldo < -0.005 ? "text-red-700" : c.saldo > 0.005 ? "text-sky-700" : "text-slate-500"}`}>
                {importe(c.saldo)}
              </Td>
              <Td className="text-slate-500">{c.ultimo ? fechaCorta(c.ultimo) : "—"}</Td>
            </tr>
          ))}
        </tbody>
      </Tabla>
      <p className="mt-2 text-xs text-slate-500">Azul: a favor del cliente (por pagar). Rojo: por cobrar.</p>
    </>
  );
}
