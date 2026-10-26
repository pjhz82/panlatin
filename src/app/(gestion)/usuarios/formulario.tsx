"use client";

import { useActionState, useState } from "react";
import { BotonGuardar, Formulario } from "@/components/formulario";
import { Aviso, BotonEnlace, Campo, Casilla, Entrada, Selector, Tarjeta } from "@/components/ui";
import type { Rol } from "@/db/schema";
import { ROLES } from "@/lib/etiquetas";
import { estadoInicial } from "@/lib/formularios";
import { guardarUsuario } from "./actions";

type Usuario = {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
  ejecutivoId: number | null;
  clienteId: number | null;
  activo: boolean;
};

export function FormularioUsuario({
  usuario,
  ejecutivos,
  clientes,
}: {
  usuario?: Usuario;
  ejecutivos: { id: number; codigo: string; nombre: string }[];
  clientes: { id: number; nombre: string }[];
}) {
  const [estado, accion] = useActionState(guardarUsuario.bind(null, usuario?.id ?? null), estadoInicial);
  const [rol, setRol] = useState<Rol>(usuario?.rol ?? "operadora");
  const e = estado.errores ?? {};

  return (
    <Tarjeta className="max-w-xl p-6">
      <Formulario accion={accion} estado={estado} className="space-y-4">
        {estado.error && <Aviso>{estado.error}</Aviso>}
        <Campo etiqueta="Nombre" error={e.nombre}>
          <Entrada name="nombre" defaultValue={usuario?.nombre} required />
        </Campo>
        <Campo etiqueta="Correo" error={e.email}>
          <Entrada name="email" type="email" defaultValue={usuario?.email} required />
        </Campo>
        <Campo etiqueta="Rol" error={e.rol}>
          <Selector name="rol" value={rol} onChange={(ev) => setRol(ev.target.value as Rol)}>
            {Object.entries(ROLES).map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </Selector>
        </Campo>
        {rol === "ejecutivo" && (
          <Campo etiqueta="Ejecutivo" error={e.ejecutivoId}>
            <Selector name="ejecutivoId" defaultValue={usuario?.ejecutivoId ?? ""}>
              <option value="">Elige…</option>
              {ejecutivos.map((ej) => (
                <option key={ej.id} value={ej.id}>
                  {ej.codigo} — {ej.nombre}
                </option>
              ))}
            </Selector>
          </Campo>
        )}
        {rol === "cliente" && (
          <Campo etiqueta="Cliente" error={e.clienteId} ayuda="Verá todas las subcuentas de este cliente.">
            <Selector name="clienteId" defaultValue={usuario?.clienteId ?? ""}>
              <option value="">Elige…</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Selector>
          </Campo>
        )}
        <Campo
          etiqueta={usuario ? "Nueva contraseña" : "Contraseña inicial"}
          error={e.password}
          ayuda={usuario ? "Déjala vacía para no cambiarla." : "Mínimo 10 caracteres."}
        >
          <Entrada name="password" type="password" autoComplete="new-password" required={!usuario} />
        </Campo>
        {usuario && <Casilla name="activo" etiqueta="Activo" defaultChecked={usuario.activo} />}
        <div className="flex gap-2 pt-2">
          <BotonGuardar />
          <BotonEnlace href="/usuarios" variante="secundario">
            Cancelar
          </BotonEnlace>
        </div>
      </Formulario>
    </Tarjeta>
  );
}
