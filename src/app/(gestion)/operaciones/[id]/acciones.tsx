"use client";

import { useActionState } from "react";
import { BotonGuardar, Formulario } from "@/components/formulario";
import { AreaTexto, Aviso, Boton, Entrada } from "@/components/ui";
import { estadoInicial } from "@/lib/formularios";
import { anularOperacion, firmarOperacion } from "../actions";

export function FormularioFirma({ operacionId, ejecutivo }: { operacionId: number; ejecutivo: string }) {
  const [estado, accion] = useActionState(firmarOperacion.bind(null, operacionId), estadoInicial);
  return (
    <Formulario accion={accion} estado={estado} className="space-y-3">
      {estado.error && <Aviso>{estado.error}</Aviso>}
      <AreaTexto name="comentario" rows={2} placeholder="Comentario (obligatorio si rechazas)" />
      <div className="flex flex-wrap gap-2">
        <Boton type="submit" name="aprueba" value="si" onClick={(e) => setValor(e, "si")}>
          Aprobar como {ejecutivo}
        </Boton>
        <Boton type="submit" name="aprueba" value="no" variante="peligro" onClick={(e) => setValor(e, "no")}>
          Rechazar
        </Boton>
      </div>
      <input type="hidden" name="aprueba" defaultValue="si" />
    </Formulario>
  );
}

/** El envío por onSubmit no incluye el botón pulsado: lo copiamos a un campo oculto. */
function setValor(e: React.MouseEvent<HTMLButtonElement>, valor: string) {
  const oculto = e.currentTarget.form?.querySelector<HTMLInputElement>('input[type=hidden][name="aprueba"]');
  if (oculto) oculto.value = valor;
}

export function FormularioAnular({ operacionId }: { operacionId: number }) {
  const [estado, accion] = useActionState(anularOperacion.bind(null, operacionId), estadoInicial);
  return (
    <Formulario accion={accion} estado={estado} className="space-y-2">
      {estado.error && <Aviso>{estado.error}</Aviso>}
      <Entrada name="motivo" placeholder="Motivo de la anulación" required />
      <Boton type="submit" variante="peligro">
        Anular operación
      </Boton>
    </Formulario>
  );
}
