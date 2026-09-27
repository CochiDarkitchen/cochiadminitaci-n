# COCHI Administración — Guía de instalación

Archivos que necesitas (los 3 que te entregué): `index.html`, `app.js`, `schema.sql`.

## Parte A — Crear el proyecto en Supabase
1. Entra a supabase.com y crea una cuenta (o inicia sesión).
2. "New Project" → ponle un nombre (ej. `cochi-admin`), crea una contraseña de base de datos y **guárdala** en un lugar seguro, elige la región más cercana. El plan Free alcanza de sobra para empezar.
3. Espera 1-2 minutos mientras Supabase prepara el proyecto.

## Parte B — Crear las tablas
1. Menú lateral → **SQL Editor** → "New query".
2. Abre `schema.sql` con cualquier editor de texto, copia todo su contenido.
3. Pégalo en el SQL Editor de Supabase y presiona **Run**.
4. Debe decir "Success". Si aparece un error, cópialo tal cual para revisarlo.

## Parte C — Crear tu usuario administrador
1. Menú lateral → **Authentication** → **Users** → "Add user" → "Create new user".
2. Ingresa tu correo y una contraseña segura. Marca **"Auto Confirm User"**.
3. Ese correo y contraseña son los que usarás para entrar a COCHI Administración (ya no hay usuario/contraseña escritos en el código).

## Parte D — Conectar tu proyecto con Supabase
1. Menú lateral → **Project Settings** (ícono de engranaje) → **API**.
2. Copia el **Project URL** (algo como `https://xxxx.supabase.co`).
3. Copia la clave **anon public** (una cadena larga).
4. Abre `app.js` con un editor de texto y busca estas dos líneas, al principio del archivo:
   ```
   const SUPABASE_URL = "PEGA_AQUI_TU_SUPABASE_URL";
   const SUPABASE_ANON_KEY = "PEGA_AQUI_TU_SUPABASE_ANON_KEY";
   ```
5. Reemplaza los textos entre comillas por tu URL y tu anon key reales, y guarda.

> Como el proyecto sigue siendo HTML/JS simple (sin paso de "build"), no aplican variables de entorno de Vercel aquí — la URL y la anon key van directo en `app.js`. Eso es seguro: la anon key no es secreta, la protección real es RLS (ver más abajo).

## Parte E — Subir a Vercel
**Opción más simple (con GitHub):**
1. Crea un repositorio nuevo en GitHub y sube `index.html` y `app.js` (puedes arrastrarlos desde la web de GitHub, sin usar comandos).
2. En vercel.com → "Add New" → "Project" → importa ese repositorio.
3. Framework Preset: **Other** (no necesita build). Deja lo demás por defecto → **Deploy**.
4. En segundos te da una URL como `https://cochi-admin.vercel.app` — ese es tu sistema en línea.

**Alternativa (sin GitHub, con terminal):** instala Node.js, luego en la carpeta del proyecto ejecuta `npm install -g vercel` y después `vercel` — sigue las instrucciones en pantalla.

## Parte F — Probar
1. Abre la URL de Vercel desde tu PC e inicia sesión con el usuario de la Parte C.
2. Crea un producto de prueba.
3. Abre la misma URL desde tu teléfono, inicia sesión, y confirma que ves ese mismo producto.

## Checklist de pruebas
- [ ] Login correcto / login con datos incorrectos muestra el error adecuado
- [ ] Crear, editar y eliminar un producto
- [ ] Crear, editar y eliminar un cliente
- [ ] Crear, editar y eliminar un proveedor
- [ ] Registrar un gasto asociado a un proveedor
- [ ] Crear una orden con varios productos y una zona de delivery
- [ ] El stock del producto baja automáticamente después de la orden
- [ ] Cambiar una orden a "Cancelada" y confirmar que el stock se devuelve
- [ ] Cambiar la tasa de cambio y confirmar que las órdenes ya creadas NO cambian de valor
- [ ] Agregar, editar y eliminar una zona de delivery
- [ ] Vista previa e impresión de un ticket de 58mm
- [ ] Cerrar sesión
- [ ] Crear algo en el teléfono y verlo aparecer en la PC sin recargar la página (sincronización en tiempo real)

## Sobre la seguridad (para que quede claro)
- La **anon key** en `app.js` no es secreta — Supabase la diseñó para vivir en el navegador. Lo que de verdad protege tus datos es **RLS**, ya activado en las 8 tablas: solo alguien con sesión iniciada puede leer o escribir.
- La **service_role key** (esa sí es secreta) no se usa en ningún lugar de este proyecto.
- Si algún día sospechas que tu código quedó expuesto de forma insegura, puedes rotar la anon key desde Project Settings → API.

## Qué quedó pendiente para más adelante
- Roles diferenciados (gerente/empleado): la base ya está lista (Supabase Auth); falta una tabla de perfiles con rol y políticas RLS por rol.
- Reportes exportables a PDF/Excel, editor visual del ticket, personalización de colores/logo y auditoría de acciones: no entraron en esta migración — se agregan sobre esta misma base cuando quieras.
