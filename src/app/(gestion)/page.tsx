import Link from "next/link";
import { count, countDistinct, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { clientes, cuentas, empresas, ejecutivos, subcuentas, usuarios } from "@/db/schema";
import { Encabezado, Tarjeta } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";

export const metadata = { title: "Inicio" };

function Cifra({ titulo, valor, href }: { titulo: string; valor: number; href?: string }) {
  const contenido = (
    <Tarjeta className="p-5 transition hover:border-slate-300">
      <p className="text-sm text-slate-500">{titulo}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{valor.toLocaleString("es")}</p>
    </Tarjeta>
  );
  return href ? <Link href={href}>{contenido}</Link> : contenido;
}

export default async function PaginaInicio() {
  const usuario = await requerirUsuario(["admin", "ejecutivo", "operadora"]);
  const esEjecutivo = usuario.rol === "ejecutivo";
  const deMiCartera = esEjecutivo
    ? or(
        eq(clientes.ejecutivoId, usuario.ejecutivoId ?? -1),
        eq(subcuentas.ejecutivoId, usuario.ejecutivoId ?? -1),
      )
    : undefined;

  const [[{ nClientes, nSubcuentas }], [{ nCuentas }], [{ nEmpresas }], [{ nEjecutivos }], [{ nUsuarios }]] =
    await Promise.all([
      db
        .select({ nClientes: countDistinct(clientes.id), nSubcuentas: countDistinct(subcuentas.id) })
        .from(clientes)
        .leftJoin(subcuentas, eq(subcuentas.clienteId, clientes.id))
        .where(deMiCartera),
      db.select({ nCuentas: count() }).from(cuentas).where(eq(cuentas.activa, true)),
      db.select({ nEmpresas: count() }).from(empresas).where(eq(empresas.activa, true)),
      db.select({ nEjecutivos: count() }).from(ejecutivos).where(eq(ejecutivos.activo, true)),
      db.select({ nUsuarios: count() }).from(usuarios).where(eq(usuarios.activo, true)),
    ]);

  return (
    <>
      <Encabezado
        titulo={`Hola, ${usuario.nombre.split(" ")[0]}`}
        descripcion={esEjecutivo ? "Resumen de tu cartera de clientes." : "Resumen del holding."}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Cifra titulo={esEjecutivo ? "Mis clientes" : "Clientes"} valor={nClientes} href="/clientes" />
        <Cifra titulo="Subcuentas" valor={nSubcuentas} href="/clientes" />
        <Cifra titulo="Cuentas de tesorería activas" valor={nCuentas} href="/cuentas" />
        {usuario.rol === "admin" && (
          <>
            <Cifra titulo="Empresas" valor={nEmpresas} href="/empresas" />
            <Cifra titulo="Ejecutivos" valor={nEjecutivos} href="/ejecutivos" />
            <Cifra titulo="Usuarios activos" valor={nUsuarios} href="/usuarios" />
          </>
        )}
      </div>
      <Tarjeta className="mt-6 p-5 text-sm text-slate-600">
        <p className="font-medium text-slate-900">Próximamente</p>
        <p className="mt-1">
          Pedidos con doble firma de ejecutivos, estados de cuenta, conciliación diaria de bancos,
          wallets y caja, y posición consolidada del holding.
        </p>
      </Tarjeta>
    </>
  );
}
