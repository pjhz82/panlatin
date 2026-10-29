import { NextResponse, type NextRequest } from "next/server";

// Comprobación optimista: sin cookie, al login. La validación real de la
// sesión y del rol se hace en el servidor con requerirUsuario().
export function proxy(request: NextRequest) {
  if (!request.cookies.has("sesion")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // /seguimiento/<token>: enlace público para que el cliente vea su operación sin usuario.
  matcher: ["/((?!login|instalar|seguimiento/|_next/static|_next/image|favicon.ico).*)"],
};
