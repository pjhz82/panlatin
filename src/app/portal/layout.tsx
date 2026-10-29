import { Marco } from "@/components/marco";
import { requerirUsuario } from "@/lib/auth";

export default async function LayoutPortal({ children }: LayoutProps<"/portal">) {
  const usuario = await requerirUsuario(["cliente"]);
  return (
    <Marco usuario={usuario} enlaces={[
        { href: "/portal", texto: "Mis cuentas" },
        { href: "/portal/operaciones", texto: "Mis operaciones" },
      ]}>
      {children}
    </Marco>
  );
}
