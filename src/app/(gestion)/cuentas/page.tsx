import Link from "next/link";
import { db } from "@/db";
import { cuentas, type TipoCuenta } from "@/db/schema";
import { BotonEnlace, Encabezado, EstadoActivo, FilaVacia, Tabla, Td, Th } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import { saldosCuentas } from "@/lib/datos";
import { fechaCorta, importe } from "@/lib/dinero";
import { MONEDAS, REDES, abreviar, urlExplorador } from "@/lib/etiquetas";

export const metadata = { title: "Cuentas" };

const ORDEN: TipoCuenta[] = ["banco", "wallet", "exchange", "caja"];
const TITULOS: Record<TipoCuenta, string> = {
  banco: "Bancos",
  wallet: "Wallets",
  exchange: "Exchanges",
  caja: "Cajas de efectivo",
};

export default async function PaginaCuentas() {
  const usuario = await requerirUsuario(["admin", "ejecutivo", "operadora"]);
  const [saldos, datos] = await Promise.all([
    saldosCuentas(),
    db.select({ id: cuentas.id, entidad: cuentas.entidad, red: cuentas.red, direccion: cuentas.direccion }).from(cuentas),
  ]);
  const extra = new Map(datos.map((d) => [d.id, d]));

  return (
    <>
      <Encabezado
        titulo="Cuentas de tesorería"
        descripcion="Bancos, wallets, exchanges y cajas de efectivo de todo el holding, con su saldo."
        acciones={usuario.rol === "admin" && <BotonEnlace href="/cuentas/nueva">Nueva cuenta</BotonEnlace>}
      />
      <div className="space-y-8">
        {ORDEN.map((tipo) => {
          const delTipo = saldos.filter((f) => f.tipo === tipo);
          return (
            <section key={tipo}>
              <h2 className="mb-3 text-lg font-semibold">
                {TITULOS[tipo]} <span className="text-sm font-normal text-slate-500">({delTipo.length})</span>
              </h2>
              <Tabla>
                <thead>
                  <tr>
                    <Th>Nombre</Th>
                    <Th>Empresa</Th>
                    <Th>{tipo === "wallet" ? "Red / dirección" : "Entidad"}</Th>
                    <Th className="text-right">Saldo</Th>
                    <Th>Último mov.</Th>
                    <Th>Estado</Th>
                  </tr>
                </thead>
                <tbody>
                  {delTipo.length === 0 && <FilaVacia columnas={6} texto="Ninguna todavía." />}
                  {delTipo.map((c) => {
                    const d = extra.get(c.id);
                    return (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <Td>
                          <Link href={`/cuentas/${c.id}`} className="font-medium hover:underline">
                            {c.nombre}
                          </Link>
                        </Td>
                        <Td>{c.empresa ?? "—"}</Td>
                        <Td>
                          {d?.red && d.direccion ? (
                            <a
                              href={urlExplorador(d.red, d.direccion)}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-xs text-sky-700 hover:underline"
                              title={d.direccion}
                            >
                              {REDES[d.red].split(" ")[0]} · {abreviar(d.direccion)}
                            </a>
                          ) : (
                            (d?.entidad ?? "—")
                          )}
                        </Td>
                        <Td className="whitespace-nowrap text-right tabular-nums">
                          <span className="text-xs text-slate-500">{MONEDAS[c.moneda]}</span> {importe(c.saldo)}
                        </Td>
                        <Td className="text-slate-500">{c.ultimo ? fechaCorta(c.ultimo) : "—"}</Td>
                        <Td>
                          <EstadoActivo activo={c.activa} />
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Tabla>
            </section>
          );
        })}
      </div>
    </>
  );
}
