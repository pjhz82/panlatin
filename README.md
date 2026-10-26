# Tesorería Panlatin

Plataforma de tesorería del holding: pedidos con doble firma de ejecutivos,
estados de cuenta de clientes, conciliación diaria de bancos, wallets y caja,
y posición consolidada de las empresas.

## Estado

**Fase 1 (esta):** inicio de sesión con roles, empresas, cuentas de tesorería
(bancos, wallets, exchanges y cajas), ejecutivos, clientes con subcuentas,
usuarios, portal de clientes y registro de auditoría.

**Siguientes fases:**
2. Pedidos con doble firma, estados de cuenta y saldos.
3. Conciliación diaria: wallets automática, bancos por extracto y caja.
4. Utilidades, gastos e informes consolidados.
5. Migración del histórico de los Excel.

## Roles

| Rol | Qué puede hacer |
|---|---|
| Administrador | Todo: empresas, cuentas, ejecutivos, clientes y usuarios. |
| Operadora | Ve todo; crea y edita clientes y subcuentas. |
| Ejecutivo | Ve solo su cartera de clientes. Firma pedidos (fase 2). |
| Cliente | Portal propio: ve sus subcuentas; solicitará pedidos (fase 2). |

Una subcuenta sin ejecutivo propio usa el del cliente.

## Tecnología

Next.js 16 (App Router, Server Actions) · TypeScript · PostgreSQL · Drizzle ORM · Tailwind CSS.

## Puesta en marcha

```bash
npm install
cp .env.example .env          # y pon tu DATABASE_URL
npm run db:migrar             # crea las tablas (solo base de datos local)
npm run crear-admin -- tu@correo.com "Tu Nombre" "una-contraseña-larga"
npm run dev                   # http://localhost:3000
```

### Carga inicial de catálogos

```bash
npm run importar-catalogos -- datos/catalogos.json
```

El JSON contiene datos reales de la empresa (clientes, cuentas, wallets) y por
eso vive en `datos/`, que **no se sube al repositorio**. Se puede ejecutar varias
veces: lo que ya existe no se toca.

## Publicación en Netlify

El sitio `panlatin-tesoreria` usa **Netlify Database**: Netlify crea el
PostgreSQL y aplica en cada publicación las migraciones de
`netlify/database/migrations/` (nunca se aplican a mano en producción).

Primer administrador: con la base vacía, abre `/instalar` e introduce la clave
de la variable de entorno `INSTALACION_TOKEN`. En cuanto existe un usuario,
esa página deja de funcionar.

## Scripts

| Script | Para qué |
|---|---|
| `npm run dev` | Servidor de desarrollo. |
| `npm run build` / `npm start` | Compilar y servir en producción. |
| `npm run db:generar` | Generar una migración tras cambiar `src/db/schema.ts`. |
| `npm run db:migrar` | Aplicar migraciones pendientes a la base local. |
| `npm run db:studio` | Explorar la base de datos en el navegador. |
| `npm run crear-admin` | Crear o reactivar un administrador. |
| `npm run importar-catalogos` | Carga inicial de catálogos desde JSON. |

## Estructura

```
src/
  app/
    login/           inicio de sesión
    (gestion)/       área de administración, ejecutivos y operadoras
    portal/          portal de clientes
  components/        UI compartida
  db/                esquema y conexión (Drizzle)
  lib/               sesión, permisos/alcance, auditoría, formularios
  proxy.ts           redirige al login si no hay sesión
scripts/             tareas de consola (admin, importación)
netlify/database/migrations/   migraciones SQL (Drizzle Kit)
```

## Seguridad

- Contraseñas con bcrypt; sesiones en base de datos (la cookie lleva un token
  aleatorio y solo se guarda su hash), con caducidad de 12 horas.
- Cada página y cada acción comprueba sesión y rol en el servidor.
- Cambiar la contraseña o desactivar un usuario cierra sus sesiones.
- Todas las altas, ediciones e inicios de sesión quedan en `auditoria`.
