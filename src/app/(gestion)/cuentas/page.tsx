import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { cuentas, empresas, type TipoCuenta } from "@/db/schema";
import { BotonEnlace, Encabezado, EstadoActivo, FilaVacia, Tabla, Td, Th } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
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
  const esAdmin = usuario.rol === "admin";
  const filas = await db
    .select({
      id: cuentas.id,
      nombre: cuentas.nombre,
      tipo: cuentas.tipo,
      moneda: cuentas.moneda,
      entidad: cuentas.entidad,
      numero: cuentas.numero,
      red: cuentas.red,
      direccion: cuentas.direccion,
      activa: cuentas.activa,
      empresa: empresas.nombre,
    })
    .from(cuentas)
    .leftJoin(empresas, eq(empresas.id, cuentas.empresaId))
    .orderBy(asc(empresas.nombre), asc(cuentas.nombre));

  return (
    <>
      <Encabezado
        titulo="Cuentas de tesorería"
        descripcion="Bancos, wallets, exchanges y cajas de efectivo de todo el holding."
        acciones={esAdmin && <BotonEnlace href="/cuentas/nueva">Nueva cuenta</BotonEnlace>}
      />
      <div className="space-y-8">
        {ORDEN.map((tipo) => {
          const delTipo = filas.filter((f) => f.tipo === tipo);
          return (
            <section key={tipo}>
              <h2 className="mb-3 text-lg font-semibold">
                {TITULOS[tipo]}{" "}
                <span className="text-sm font-normal text-slate-500">({delTipo.length})</span>
              </h2>
              <Tabla>
                <thead>
                  <tr>
                    <Th>Nombre</Th>
                    <Th>Empresa</Th>
                    <Th>Moneda</Th>
                    <Th>{tipo === "wallet" ? "Red / dirección" : tipo === "caja" ? "" : "Entidad"}</Th>
                    <Th>Estado</Th>
                  </tr>
                </thead>
                <tbody>
                  {delTipo.length === 0 && <FilaVacia columnas={5} texto="Ninguna todavía." />}
                  {delTipo.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <Td>
                        {esAdmin ? (
                          <Link href={`/cuentas/${c.id}`} className="font-medium hover:underline">
                            {c.nombre}
                          </Link>
                        ) : (
                          <span className="font-medium">{c.nombre}</span>
                        )}
                      </Td>
                      <Td>{c.empresa ?? "—"}</Td>
                      <Td>{MONEDAS[c.moneda]}</Td>
                      <Td>
                        {c.red && c.direccion ? (
                          <a
                            href={urlExplorador(c.red, c.direccion)}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-xs text-sky-700 hover:underline"
                            title={c.direccion}
                          >
                            {REDES[c.red].split(" ")[0]} · {abreviar(c.direccion)}
                          </a>
                        ) : (
                          [c.entidad, c.numero].filter(Boolean).join(" · ") || "—"
                        )}
                      </Td>
                      <Td>
                        <EstadoActivo activo={c.activa} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            </section>
          );
        })}
      </div>
    </>
  );
}
