import Link from "next/link";
import { notFound } from "next/navigation";
import { SeguimientoCliente } from "@/components/seguimiento-cliente";
import { requerirUsuario } from "@/lib/auth";
import { operacionesDeCliente } from "@/lib/flujo";

export const metadata = { title: "Operación" };

export default async function PaginaMiOperacion({ params }: PageProps<"/portal/operaciones/[id]">) {
  const usuario = await requerirUsuario(["cliente"]);
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  // Solo operaciones de sus subcuentas (abiertas o del último mes).
  const o = (await operacionesDeCliente(usuario.clienteId ?? -1)).find((x) => x.id === id);
  if (!o) notFound();
  return (
    <SeguimientoCliente
      o={o}
      publico={false}
      volver={
        <Link href="/portal/operaciones" className="underline">
          ← Mis operaciones
        </Link>
      }
    />
  );
}
