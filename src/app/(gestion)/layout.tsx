import { Marco } from "@/components/marco";
import type { EnlaceNav } from "@/components/navegacion";
import { requerirUsuario } from "@/lib/auth";

export default async function LayoutGestion({ children }: LayoutProps<"/">) {
  const usuario = await requerirUsuario(["admin", "ejecutivo", "operadora"]);

  const enlaces: EnlaceNav[] = [
    { href: "/", texto: "Inicio" },
    { href: "/clientes", texto: "Clientes" },
    { href: "/cuentas", texto: "Cuentas" },
  ];
  if (usuario.rol === "admin") {
    enlaces.push(
      { href: "/empresas", texto: "Empresas" },
      { href: "/ejecutivos", texto: "Ejecutivos" },
      { href: "/usuarios", texto: "Usuarios" },
    );
  }

  return (
    <Marco usuario={usuario} enlaces={enlaces}>
      {children}
    </Marco>
  );
}
