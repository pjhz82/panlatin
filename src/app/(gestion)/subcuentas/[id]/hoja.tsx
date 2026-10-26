import Link from "next/link";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { cuentas, firmas, operaciones, partidas } from "@/db/schema";
import { Insignia, Tarjeta } from "@/components/ui";
import { hojaDeCuenta } from "@/lib/datos";
import { fechaCorta, importe } from "@/lib/dinero";
import { ESTADOS_OPERACION, FIRMAS_REQUERIDAS } from "@/lib/operaciones";
import { FormularioHoja } from "./formulario-hoja";

/** Hoja del cliente con el mismo formato que los Excel, y fila para registrar. */
export async function HojaCliente({ subcuentaId, nombre, editable }: { subcuentaId: number; nombre: string; editable: boolean }) {
  const [filas, pendientes, listaCuentas] = await Promise.all([
    hojaDeCuenta({ subcuentaId }),
    db
      .select({
        partidaId: partidas.id,
        operacionId: operaciones.id,
        estado: operaciones.estado,
        fecha: operaciones.fecha,
        concepto: partidas.descripcion,
        pagadoA: operaciones.descripcion,
        cuenta: cuentas.nombre,
        efecto: partidas.efectoCliente,
        firmas: sql<number>`(select count(*) from ${firmas} where ${firmas.operacionId} = ${operaciones.id} and ${firmas.aprueba})`.mapWith(Number),
      })
      .from(partidas)
      .innerJoin(operaciones, eq(operaciones.id, partidas.operacionId))
      .leftJoin(cuentas, eq(cuentas.id, partidas.cuentaId))
      .where(
        and(
          eq(operaciones.subcuentaId, subcuentaId),
          inArray(operaciones.estado, ["pendiente_firmas", "aprobada", "en_ejecucion"]),
          isNull(partidas.ejecutadaEn),
          sql`${partidas.efectoCliente} <> 0`,
        ),
      )
      .orderBy(asc(operaciones.fecha), asc(partidas.id)),
    editable
      ? db
          .select({ id: cuentas.id, nombre: cuentas.nombre, moneda: cuentas.moneda })
          .from(cuentas)
          .where(eq(cuentas.activa, true))
          .orderBy(asc(cuentas.nombre))
      : Promise.resolve([]),
  ]);
  const saldo = filas.at(-1)?.saldo ?? 0;
  const cargos = filas.reduce((t, f) => t + Math.max(0, -f.importe), 0);
  const abonos = filas.reduce((t, f) => t + Math.max(0, f.importe), 0);
  const pendienteNeto = pendientes.reduce((t, p) => t + Number(p.efecto), 0);

  return (
    <Tarjeta className="overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div>
          <p className="text-lg font-semibold">{nombre}</p>
          <p className="text-xs text-slate-500">{filas.length} movimientos · importes en US$</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-slate-500">Saldo</p>
          <p className={`text-2xl font-semibold tabular-nums ${saldo < -0.005 ? "text-red-700" : "text-sky-700"}`}>{importe(saldo)}</p>
          <p className="text-xs text-slate-500">{saldo < -0.005 ? "Por cobrar" : saldo > 0.005 ? "A favor del cliente" : "Saldado"}</p>
        </div>
      </div>
      {editable && (
        <p className="border-b border-slate-100 px-4 py-2 text-xs">
          <a href="#registrar" className="text-sky-700 underline">
            Ir al final para registrar ↓
          </a>
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-left text-xs uppercase tracking-wide text-white">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Concepto</th>
              <th className="px-3 py-2">Pagado a / por</th>
              <th className="px-3 py-2">Forma de pago</th>
              <th className="px-3 py-2 text-right">Cargos</th>
              <th className="px-3 py-2 text-right">Abonos</th>
              <th className="px-3 py-2 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                  Sin movimientos todavía.
                </td>
              </tr>
            )}
            {filas.map((f, i) => (
              <tr key={f.id} className={i % 2 ? "bg-slate-50/60" : ""}>
                <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{fechaCorta(f.fecha)}</td>
                <td className="px-3 py-1.5">
                  {f.concepto ?? ""}
                  {f.nota && <span className="ml-1"><Insignia color="ambar">{f.nota}</Insignia></span>}
                </td>
                <td className="max-w-xs px-3 py-1.5 text-slate-700">{f.detalle ?? ""}</td>
                <td className="px-3 py-1.5 text-slate-700">{f.formaPago ?? ""}</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{f.importe < 0 ? importe(-f.importe) : ""}</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{f.importe > 0 ? importe(f.importe) : ""}</td>
                <td className={`whitespace-nowrap px-3 py-1.5 text-right font-medium tabular-nums ${f.saldo < -0.005 ? "text-red-700" : ""}`}>
                  {importe(f.saldo)}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-300 font-semibold">
              <td colSpan={4} className="px-3 py-2 text-right text-xs uppercase tracking-wide text-slate-500">
                Totales
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{importe(cargos)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{importe(abonos)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{importe(saldo)}</td>
            </tr>
            {pendientes.map((p) => (
              <tr key={p.partidaId} className="bg-amber-50/70 italic text-slate-600">
                <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{fechaCorta(p.fecha)}</td>
                <td className="px-3 py-1.5">
                  {p.concepto}{" "}
                  <Link href={`/operaciones/${p.operacionId}`} className="not-italic">
                    <Insignia color={ESTADOS_OPERACION[p.estado].color}>
                      Op. {p.operacionId} · {ESTADOS_OPERACION[p.estado].nombre}
                      {p.estado === "pendiente_firmas" && ` ${p.firmas}/${FIRMAS_REQUERIDAS}`}
                    </Insignia>
                  </Link>
                </td>
                <td className="px-3 py-1.5">{p.pagadoA ?? ""}</td>
                <td className="px-3 py-1.5">{p.cuenta ?? ""}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{Number(p.efecto) < 0 ? importe(-Number(p.efecto)) : ""}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{Number(p.efecto) > 0 ? importe(Number(p.efecto)) : ""}</td>
                <td className="px-3 py-1.5 text-right text-xs">pendiente</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pendientes.length > 0 && (
        <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-600">
          Pendiente de aplicar: <span className="tabular-nums">{importe(pendienteNeto)}</span> → saldo cuando se apliquen:{" "}
          <span className="font-medium tabular-nums">{importe(saldo + pendienteNeto)}</span>
        </p>
      )}
      {editable && (
        <div id="registrar" className="border-t border-slate-200 bg-slate-50 px-4 py-4">
          <p className="mb-2 text-sm font-semibold">Registrar en la hoja</p>
          <FormularioHoja subcuentaId={subcuentaId} cuentas={listaCuentas} hoy={new Date().toISOString().slice(0, 10)} />
          <p className="mt-2 text-xs text-slate-500">
            Cargo: en contra del cliente (le pagamos o le cobramos una operación). Abono: a su favor (nos paga o entrega fondos). Si
            eliges una cuenta, el movimiento también se aplica a esa cuenta.
          </p>
        </div>
      )}
    </Tarjeta>
  );
}
