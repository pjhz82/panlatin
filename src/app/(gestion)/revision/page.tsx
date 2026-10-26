import Link from "next/link";
import { Indicador } from "@/components/indicadores";
import { Encabezado, Insignia, Tabla, Td, Th } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import { importe } from "@/lib/dinero";
import { revisionExcel } from "@/lib/revision";

export const metadata = { title: "Revisión" };

export default async function PaginaRevision({ searchParams }: PageProps<"/revision">) {
  await requerirUsuario(["admin", "operadora"]);
  const soloDiferencias = (await searchParams).ver === "diferencias";
  const todas = await revisionExcel();
  const filas = soloDiferencias ? todas.filter((r) => r.cuadra === false) : todas;
  const cuadran = todas.filter((r) => r.cuadra === true).length;
  const difieren = todas.filter((r) => r.cuadra === false).length;
  const sinRef = todas.filter((r) => r.cuadra === null).length;
  const movimientos = todas.reduce((t, r) => t + r.movimientos, 0);

  return (
    <>
      <Encabezado
        titulo="Revisión de la importación"
        descripcion="Cada estado de cuenta de la web comparado con el saldo que mostraba su hoja de Excel."
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Indicador titulo="Hojas importadas" valor={todas.length} detalle={`${movimientos.toLocaleString("es")} movimientos`} />
        <Indicador titulo="Cuadran al céntimo" valor={<span className="text-emerald-700">{cuadran}</span>} />
        <Indicador titulo="Con diferencia" valor={<span className={difieren ? "text-red-700" : ""}>{difieren}</span>} />
        <Indicador titulo="Sin saldo de referencia" valor={sinRef} detalle="La hoja no tenía saldo final" />
      </div>
      <div className="mb-3 flex gap-3 text-sm">
        <Link href="/revision" className={soloDiferencias ? "underline" : "font-semibold"}>
          Todas
        </Link>
        <Link href="/revision?ver=diferencias" className={soloDiferencias ? "font-semibold" : "underline"}>
          Solo con diferencia
        </Link>
      </div>
      <Tabla>
        <thead>
          <tr>
            <Th>Estado de cuenta</Th>
            <Th>Hoja de Excel</Th>
            <Th className="text-right">Movimientos</Th>
            <Th className="text-right">Saldo web</Th>
            <Th className="text-right">Saldo Excel</Th>
            <Th>Resultado</Th>
          </tr>
        </thead>
        <tbody>
          {filas.map((r) => (
            <tr key={`${r.tipo}-${r.id}`} className="hover:bg-slate-50">
              <Td>
                <Link href={r.tipo === "subcuenta" ? `/subcuentas/${r.id}` : `/cuentas/${r.id}`} className="font-medium hover:underline">
                  {r.nombre}
                </Link>
                <span className="ml-2 text-xs text-slate-500">{r.tipo === "subcuenta" ? "cliente" : "tesorería"}</span>
              </Td>
              <Td className="text-slate-600">{r.hoja}</Td>
              <Td className="text-right tabular-nums">{r.movimientos}</Td>
              <Td className="text-right tabular-nums">{importe(r.saldo)}</Td>
              <Td className="text-right tabular-nums">{importe(r.saldoExcel)}</Td>
              <Td>
                {r.cuadra === null ? (
                  <Insignia>Sin referencia</Insignia>
                ) : r.cuadra ? (
                  <Insignia color="verde">✓ Cuadra</Insignia>
                ) : (
                  <Insignia color="rojo">✗ Diferencia {importe(r.saldo - (r.saldoExcel ?? 0))}</Insignia>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </>
  );
}
