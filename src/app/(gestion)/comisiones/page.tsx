import Link from "next/link";
import { Indicador } from "@/components/indicadores";
import { Boton, Encabezado, Entrada, FilaVacia, Insignia, Tabla, Td, Th } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import { comisionesPorEjecutivo } from "@/lib/comisiones";
import { fechaCorta, importe } from "@/lib/dinero";
import { ESTADOS_OPERACION, TIPOS_OPERACION } from "@/lib/operaciones";

export const metadata = { title: "Comisiones" };

const esFecha = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function PaginaComisiones({ searchParams }: PageProps<"/comisiones">) {
  await requerirUsuario(["admin", "operadora"]);
  const p = await searchParams;
  const hoy = new Date();
  const desde = esFecha(p.desde) ? p.desde : iso(new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1)));
  const hasta = esFecha(p.hasta) ? p.hasta : iso(hoy);
  const ejecutivoId = Number(p.ejecutivo) || undefined;
  const { resumen, lista } = await comisionesPorEjecutivo(desde, hasta, ejecutivoId);
  const total = resumen.reduce((t, r) => t + r.ganada, 0);
  const enCurso = resumen.reduce((t, r) => t + r.enCurso, 0);
  const enlace = (extra: Record<string, string>) => `/comisiones?${new URLSearchParams({ desde, hasta, ...extra })}`;

  return (
    <>
      <Encabezado
        titulo="Comisiones de ejecutivos"
        descripcion={`Del ${fechaCorta(desde)} al ${fechaCorta(hasta)} · La comisión de cada operación es del ejecutivo del cliente. Operaciones dadas en la web; importes en US$.`}
      />
      <form className="mb-6 flex flex-wrap items-end gap-2 text-sm">
        <label className="text-xs text-slate-500">
          Desde
          <Entrada type="date" name="desde" defaultValue={desde} className="w-40" />
        </label>
        <label className="text-xs text-slate-500">
          Hasta
          <Entrada type="date" name="hasta" defaultValue={hasta} className="w-40" />
        </label>
        {ejecutivoId && <input type="hidden" name="ejecutivo" value={ejecutivoId} />}
        <Boton type="submit" variante="secundario">
          Ver
        </Boton>
      </form>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Indicador titulo="Comisiones ganadas (operaciones completadas)" valor={`US$ ${importe(total)}`} />
        <Indicador titulo="En curso (operaciones abiertas)" valor={`US$ ${importe(enCurso)}`} />
      </div>

      <Tabla>
        <thead>
          <tr>
            <Th>Ejecutivo</Th>
            <Th className="text-right">Operaciones</Th>
            <Th className="text-right">Ganada</Th>
            <Th className="text-right">En curso</Th>
            <Th className="text-right">Total</Th>
          </tr>
        </thead>
        <tbody>
          {resumen.map((r) => (
            <tr key={r.id} className={ejecutivoId === r.id ? "bg-sky-50" : "hover:bg-slate-50"}>
              <Td>
                <Link href={enlace(ejecutivoId === r.id ? {} : { ejecutivo: String(r.id) })} className="font-medium hover:underline">
                  {r.codigo}
                </Link>{" "}
                <span className="text-slate-500">{r.nombre}</span>
              </Td>
              <Td className="text-right tabular-nums">{r.operaciones}</Td>
              <Td className="text-right font-medium tabular-nums text-emerald-700">{importe(r.ganada)}</Td>
              <Td className="text-right tabular-nums text-slate-600">{importe(r.enCurso)}</Td>
              <Td className="text-right tabular-nums">{importe(r.ganada + r.enCurso)}</Td>
            </tr>
          ))}
        </tbody>
      </Tabla>

      <h2 className="mb-3 mt-8 text-lg font-semibold">
        Detalle {ejecutivoId ? `de ${resumen.find((r) => r.id === ejecutivoId)?.codigo}` : "de todos"}
        {ejecutivoId && (
          <Link href={enlace({})} className="ml-3 text-sm font-normal text-slate-600 underline">
            ver todos
          </Link>
        )}
      </h2>
      <Tabla>
        <thead>
          <tr>
            <Th>Op.</Th>
            <Th>Fecha</Th>
            <Th>Ejecutivo</Th>
            <Th>Cliente</Th>
            <Th>Tipo</Th>
            <Th className="text-right">Monto</Th>
            <Th className="text-right">Comisión</Th>
            <Th>Estado</Th>
          </tr>
        </thead>
        <tbody>
          {lista.length === 0 && <FilaVacia columnas={8} texto="No hay operaciones con comisión en el periodo." />}
          {lista.map((o) => (
            <tr key={o.id}>
              <Td>
                {o.origen === "web" ? (
                  <Link href={`/operaciones/${o.id}`} className="hover:underline">
                    {o.id}
                  </Link>
                ) : (
                  <span className="text-slate-500">{o.id}</span>
                )}
              </Td>
              <Td className="whitespace-nowrap">{fechaCorta(o.fecha)}</Td>
              <Td>{o.ejecutivo}</Td>
              <Td>{o.cliente ?? "—"}</Td>
              <Td>{TIPOS_OPERACION[o.tipo].nombre}</Td>
              <Td className="text-right tabular-nums">{o.montoUsd ? importe(o.montoUsd) : "—"}</Td>
              <Td className={`text-right font-medium tabular-nums ${Number(o.utilidad) < 0 ? "text-red-700" : ""}`}>{importe(o.utilidad)}</Td>
              <Td>
                <Insignia color={ESTADOS_OPERACION[o.estado].color}>{ESTADOS_OPERACION[o.estado].nombre}</Insignia>
              </Td>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </>
  );
}
