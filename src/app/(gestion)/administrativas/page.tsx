import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { BarraAvance } from "@/components/avance";
import { FormularioAdministrativa } from "@/components/formularios-flujo";
import { Encabezado, FilaVacia, Insignia, Tabla, Tarjeta, Td, Th } from "@/components/ui";
import { db } from "@/db";
import { cuentas } from "@/db/schema";
import { requerirUsuario } from "@/lib/auth";
import { fechaCorta, importe } from "@/lib/dinero";
import { operacionesConAvance } from "@/lib/flujo";
import { ESTADOS_OPERACION, TIPOS_OPERACION, SIMBOLO } from "@/lib/operaciones";

export const metadata = { title: "Transacciones administrativas" };

const ADMINISTRATIVAS = ["gasto", "honorarios", "comision", "traspaso"];

export default async function PaginaAdministrativas() {
  const usuario = await requerirUsuario(["admin", "operadora"]);
  const [listaCuentas, ops] = await Promise.all([
    db
      .select({ id: cuentas.id, nombre: cuentas.nombre, moneda: cuentas.moneda, entidad: cuentas.entidad })
      .from(cuentas)
      .where(eq(cuentas.activa, true))
      .orderBy(asc(cuentas.nombre)),
    operacionesConAvance(null, 600),
  ]);
  const lista = ops.filter((o) => !o.subcuentaId && ADMINISTRATIVAS.includes(o.tipo)).slice(0, 100);

  return (
    <>
      <Encabezado
        titulo="Transacciones administrativas"
        descripcion="Módulo 4 · Gastos, nómina, honorarios, comisiones bancarias y traspasos entre cuentas propias. Solo mueven bancos; se pagan desde Pagos."
      />
      {usuario.rol === "admin" ? (
        <Tarjeta className="mb-8 p-6">
          <FormularioAdministrativa cuentas={listaCuentas} hoy={new Date().toISOString().slice(0, 10)} />
        </Tarjeta>
      ) : (
        <p className="mb-6 text-sm text-slate-500">Las registra un administrador; aquí puedes consultarlas.</p>
      )}
      <Tabla>
        <thead>
          <tr>
            <Th>Op.</Th>
            <Th>Fecha</Th>
            <Th>Tipo</Th>
            <Th>Descripción</Th>
            <Th className="text-right">Importe</Th>
            <Th>Pagado</Th>
            <Th>Estado</Th>
          </tr>
        </thead>
        <tbody>
          {lista.length === 0 && <FilaVacia columnas={7} texto="Todavía no hay transacciones administrativas." />}
          {lista.map((o) => {
            const sale = o.partidas.find((p) => p.importe < 0) ?? o.partidas[0];
            return (
              <tr key={o.id}>
                <Td>
                  <Link href={`/operaciones/${o.id}`} className="font-medium hover:underline">
                    {o.id}
                  </Link>
                </Td>
                <Td className="whitespace-nowrap">{fechaCorta(o.fecha)}</Td>
                <Td>{TIPOS_OPERACION[o.tipo].nombre}</Td>
                <Td>{o.descripcion}</Td>
                <Td className="whitespace-nowrap text-right tabular-nums">
                  {sale?.moneda ? SIMBOLO[sale.moneda] : ""} {sale ? importe(Math.abs(sale.importe)) : "—"}
                </Td>
                <Td>
                  <BarraAvance pct={o.pctPagado} />
                </Td>
                <Td>
                  <Insignia color={ESTADOS_OPERACION[o.estado].color}>{ESTADOS_OPERACION[o.estado].nombre}</Insignia>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Tabla>
    </>
  );
}
