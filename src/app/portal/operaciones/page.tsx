import Link from "next/link";
import { BarraAvance } from "@/components/avance";
import { Encabezado, Insignia, Tarjeta } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import { fechaCorta, importe } from "@/lib/dinero";
import { operacionesDeCliente } from "@/lib/flujo";
import { TIPOS_OPERACION } from "@/lib/operaciones";
import { avanceParaCliente, NOMBRE_PARA_CLIENTE } from "@/lib/vista-cliente";

export const metadata = { title: "Mis operaciones" };

export default async function PaginaMisOperaciones() {
  const usuario = await requerirUsuario(["cliente"]);
  const ops = await operacionesDeCliente(usuario.clienteId ?? -1);

  return (
    <>
      <Encabezado titulo="Mis operaciones" descripcion="Cómo va cada operación: lo que nos has pagado y lo que te hemos enviado. Se muestran las abiertas y las del último mes." />
      {ops.length === 0 && <Tarjeta className="p-6 text-sm text-slate-500">No tienes operaciones en curso.</Tarjeta>}
      <div className="grid gap-4 md:grid-cols-2">
        {ops.map((o) => {
          const v = avanceParaCliente(o.estado, o.partidas);
          return (
            <Link key={o.id} href={`/portal/operaciones/${o.id}`}>
              <Tarjeta className="p-5 transition hover:border-slate-400">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{NOMBRE_PARA_CLIENTE[o.tipo] ?? TIPOS_OPERACION[o.tipo].nombre}</p>
                    <p className="text-xs text-slate-500">
                      Op. {o.id} · {fechaCorta(o.fecha)} · {o.cliente}
                    </p>
                  </div>
                  <Insignia color={v.estado.color}>{v.estado.texto}</Insignia>
                </div>
                {o.montoUsd && (
                  <p className="mt-2 text-xl font-semibold tabular-nums">
                    US$ {importe(o.montoUsd)}
                    {o.tasa && <span className="ml-2 text-sm font-normal text-slate-500">a {importe(o.tasa)}</span>}
                  </p>
                )}
                <div className="mt-3 space-y-1 text-sm">
                  {v.recibido !== null && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-600">Recibido de ti</span>
                      <BarraAvance pct={v.recibido} />
                    </div>
                  )}
                  {v.enviado !== null && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-600">Enviado a ti</span>
                      <BarraAvance pct={v.enviado} />
                    </div>
                  )}
                </div>
              </Tarjeta>
            </Link>
          );
        })}
      </div>
    </>
  );
}
