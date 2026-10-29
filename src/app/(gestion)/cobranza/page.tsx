import Link from "next/link";
import { Indicador, Seccion } from "@/components/indicadores";
import { Boton, Encabezado, FilaVacia, Insignia, Selector, Tabla, Td, Th } from "@/components/ui";
import type { RiesgoCliente } from "@/db/schema";
import { requerirUsuario } from "@/lib/auth";
import { cuentasPorCobrar } from "@/lib/cobranza";
import { fechaCorta, importe } from "@/lib/dinero";
import { RIESGOS, TRAMOS } from "@/lib/riesgo";

export const metadata = { title: "Cobranza" };

// Al día en azul; los tramos vencidos en una escala de rojo, de claro a oscuro según la gravedad.
const COLOR_TRAMO: Record<string, string> = {
  al_dia: "#86b6ef",
  "1_30": "#f2a7a6",
  "31_60": "#e66767",
  "61_90": "#d03b3b",
  "90": "#8f1d1d",
};

export default async function PaginaCobranza({ searchParams }: PageProps<"/cobranza">) {
  const usuario = await requerirUsuario(["admin", "ejecutivo", "operadora"]);
  const p = await searchParams;
  const riesgo = (Object.keys(RIESGOS) as RiesgoCliente[]).includes(p.riesgo as RiesgoCliente) ? (p.riesgo as RiesgoCliente) : undefined;
  const tramo = TRAMOS.some((t) => t.clave === p.tramo) ? String(p.tramo) : undefined;

  const todas = await cuentasPorCobrar(usuario);
  const filas = todas.filter((c) => (!riesgo || c.riesgo === riesgo) && (!tramo || c.tramo.clave === tramo));
  const total = todas.reduce((t, c) => t + c.saldo, 0);
  const vencido = todas.filter((c) => c.diasVencido > 0).reduce((t, c) => t + c.saldo, 0);
  const deRiesgo = (r: RiesgoCliente) => todas.filter((c) => c.riesgo === r).reduce((t, c) => t + c.saldo, 0);
  const porTramo = TRAMOS.map((t) => ({ ...t, monto: todas.filter((c) => c.tramo.clave === t.clave).reduce((s, c) => s + c.saldo, 0), n: todas.filter((c) => c.tramo.clave === t.clave).length }));
  const sinPlazo = todas.filter((c) => c.diasCredito === null).length;

  const enlace = (extra: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const v = { riesgo, tramo, ...extra };
    for (const [k, x] of Object.entries(v)) if (x) q.set(k, x);
    return `/cobranza${q.size ? `?${q}` : ""}`;
  };

  return (
    <>
      <Encabezado
        titulo="Cobranza"
        descripcion={`Cuentas por cobrar a hoy, con su antigüedad. Importes en US$.${usuario.rol === "ejecutivo" ? " Solo tu cartera." : ""}`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Indicador titulo="Por cobrar" valor={importe(total)} tono="cobrar" detalle={`${todas.length} subcuentas`} />
        <Indicador
          titulo="Vencido"
          valor={importe(vencido)}
          tono="cobrar"
          detalle={total > 0 ? `${Math.round((vencido / total) * 100)} % de lo que hay por cobrar` : undefined}
        />
        <Indicador titulo="Alta probabilidad de impago" valor={importe(deRiesgo("alto_riesgo"))} detalle="Clientes marcados en seguimiento" />
        <Indicador titulo="Incobrable" valor={importe(deRiesgo("incobrable"))} detalle="Se provisiona en el balance" />
        <Indicador titulo="Sin plazo pactado" valor={sinPlazo} detalle="Se cuenta desde que empezó la deuda" />
      </div>

      <div className="mt-6">
        <Seccion titulo="Antigüedad de la deuda (días vencidos)">
          {total > 0 && (
            <div className="mb-3 flex h-5 gap-0.5 overflow-hidden rounded" role="img" aria-label="Deuda por tramos de antigüedad">
              {porTramo
                .filter((t) => t.monto > 0)
                .map((t) => (
                  <span key={t.clave} title={`${t.nombre}: ${importe(t.monto)}`} style={{ width: `${(t.monto / total) * 100}%`, background: COLOR_TRAMO[t.clave] }} />
                ))}
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-5">
            {porTramo.map((t) => (
              <Link
                key={t.clave}
                href={enlace({ tramo: tramo === t.clave ? undefined : t.clave })}
                className={`rounded-lg border p-3 text-sm hover:bg-slate-50 ${tramo === t.clave ? "border-slate-900" : "border-slate-200"}`}
              >
                <span className="flex items-center gap-2 text-xs text-slate-600">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_TRAMO[t.clave] }} />
                  {t.nombre}
                </span>
                <span className="mt-1 block font-semibold tabular-nums">{importe(t.monto)}</span>
                <span className="text-xs text-slate-500">{t.n} subcuentas</span>
              </Link>
            ))}
          </div>
        </Seccion>
      </div>

      <form className="mb-3 mt-6 flex flex-wrap items-end gap-2">
        {tramo && <input type="hidden" name="tramo" value={tramo} />}
        <label className="text-xs text-slate-500">
          Riesgo
          <Selector name="riesgo" defaultValue={riesgo ?? ""} className="mt-1 w-64">
            <option value="">Todos</option>
            {Object.entries(RIESGOS).map(([v, r]) => (
              <option key={v} value={v}>
                {r.nombre}
              </option>
            ))}
          </Selector>
        </label>
        <Boton type="submit" variante="secundario">
          Filtrar
        </Boton>
        {(riesgo || tramo) && (
          <Link href="/cobranza" className="pb-2 text-sm underline">
            Quitar filtros
          </Link>
        )}
      </form>

      <Tabla>
        <thead>
          <tr>
            <Th>Subcuenta</Th>
            <Th>Ejec.</Th>
            <Th className="text-right">Por cobrar</Th>
            <Th>Debe desde</Th>
            <Th className="text-right">Días</Th>
            <Th>Plazo</Th>
            <Th>Vence</Th>
            <Th className="text-right">Días vencido</Th>
            <Th>Riesgo</Th>
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 && <FilaVacia columnas={9} texto="No hay cuentas por cobrar con estos filtros." />}
          {filas.map((c) => (
            <tr key={c.subcuentaId} className="hover:bg-slate-50">
              <Td>
                <Link href={`/subcuentas/${c.subcuentaId}`} className="font-medium hover:underline">
                  {c.subcuenta}
                </Link>
                {c.cliente !== c.subcuenta && (
                  <Link href={`/clientes/${c.clienteId}`} className="block text-xs text-slate-500 hover:underline">
                    {c.cliente}
                  </Link>
                )}
              </Td>
              <Td>{c.ejecutivo ?? "—"}</Td>
              <Td className="text-right font-medium tabular-nums text-red-700">{importe(c.saldo)}</Td>
              <Td className="whitespace-nowrap">{fechaCorta(c.inicioDeuda)}</Td>
              <Td className="text-right tabular-nums">{c.dias}</Td>
              <Td>{c.diasCredito === null ? <span className="text-slate-400">—</span> : `${c.diasCredito} d`}</Td>
              <Td className="whitespace-nowrap">{c.vence ? fechaCorta(c.vence) : "—"}</Td>
              <Td className="text-right">
                {c.diasVencido > 0 ? (
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    <span className="h-2 w-2 rounded-sm" style={{ background: COLOR_TRAMO[c.tramo.clave] }} />
                    {c.diasVencido}
                  </span>
                ) : (
                  <span className="text-emerald-700">Al día</span>
                )}
              </Td>
              <Td>
                <Link href={`/clientes/${c.clienteId}`}>
                  <Insignia color={RIESGOS[c.riesgo].color}>{RIESGOS[c.riesgo].nombre}</Insignia>
                </Link>
              </Td>
            </tr>
          ))}
        </tbody>
      </Tabla>
      <p className="mt-2 text-xs text-slate-500">
        «Debe desde»: fecha en que la subcuenta pasó a deber sin volver a cero. El riesgo y el plazo se cambian en la ficha del cliente.
      </p>
    </>
  );
}
