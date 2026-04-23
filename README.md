# Sistema de Clínica Veterinaria — Corte 3

**Matrícula:** 243827  
**Curso:** Base de Datos Avanzadas · UP Chiapas · Enero–Mayo 2026  
**Docente:** Mtro. Ramsés Alejandro Camas Nájera

---

## Cómo levantar el proyecto

```bash
# 1. Levantar PostgreSQL y Redis
docker compose up -d

# 2. API (en otra terminal)
cd api
npm install
npm run dev      # http://localhost:4000

# 3. Frontend (en otra terminal)
cd frontend
npm install
npm run dev      # http://localhost:3000
```

Antes de correr la API, asegúrate de tener un archivo `api/.env` con:

```
DATABASE_URL=postgresql://postgres:<tu_password>@localhost:5432/clinica_vet
REDIS_URL=redis://localhost:6379
PORT=4000
CORS_ORIGIN=http://localhost:3000
```

---

## Preguntas de decisiones de diseño

### 1. ¿Qué roles creaste y por qué esos permisos específicos?

Se crearon tres roles siguiendo el principio de **mínimo privilegio**:

| Rol | Acceso |
|---|---|
| `veterinario` | SELECT en mascotas, duenos, citas, inventario_vacunas, vet_atiende_mascota, v_mascotas_vacunacion_pendiente. INSERT+UPDATE en citas. SELECT+INSERT en vacunas_aplicadas. |
| `recepcion` | SELECT en mascotas, duenos, veterinarios, inventario_vacunas, v_mascotas_vacunacion_pendiente. SELECT+INSERT en citas. |
| `administrador` | ALL PRIVILEGES en todas las tablas, secuencias y rutinas. BYPASSRLS habilitado. |

El `veterinario` no tiene acceso a UPDATE/DELETE en tablas fuera de las citas propias porque su trabajo es atender pacientes, no administrar datos maestros. La `recepcion` puede insertar citas pero no modificar historial médico ni vacunas. El `administrador` tiene acceso total porque gestiona el sistema completo.

### 2. ¿Cómo le comunica el backend a PostgreSQL quién está haciendo la consulta para que funcione RLS?

Se usa el mecanismo de **variables de sesión de PostgreSQL** (`SET LOCAL`):

```sql
-- Dentro de cada transacción, antes de cualquier query:
SET LOCAL app.current_vet_id = '1';
```

Las políticas RLS leen ese valor con `current_setting('app.current_vet_id', true)::INT`. El segundo argumento `true` evita error si la variable no se ha seteado (devuelve NULL). `SET LOCAL` asegura que el valor solo existe dentro de la transacción actual — cuando se hace COMMIT o ROLLBACK, el valor desaparece.

En la API esto se implementa en `src/db.ts` mediante la función `withVetContext(vetId, fn)` que abre una transacción, ejecuta el SET LOCAL, corre el callback, y hace COMMIT/ROLLBACK automáticamente.

### 3. ¿Cómo protegiste la capa HTTP contra SQL Injection?

Tres capas de defensa:

1. **Queries parametrizadas con `$1`, `$2`**: El driver `pg` de Node.js separa el SQL de los datos. El valor del usuario nunca se concatena como texto en la query — viaja como parámetro separado que PostgreSQL trata siempre como dato literal.

2. **Validación con Zod**: Antes de que cualquier input toque la base de datos, se valida con esquemas Zod. IDs se parsean como `number.int().positive()` (bloquea strings), texto libre tiene límite de longitud, fechas tienen formato estricto. Si la validación falla, se responde 400 sin ejecutar ninguna query.

3. **Errores genéricos al cliente**: Los errores de PostgreSQL se loguean en consola pero al cliente solo se envía `"Error interno del servidor"`. Un atacante no puede leer el stack trace ni el nombre de las tablas.

### 4. ¿Cuál es la clave Redis, el TTL y la estrategia de invalidación?

| Decisión | Valor | Razón |
|---|---|---|
| **Clave** | `vacunacion:pendiente` | Identifica el recurso cacheado de forma legible |
| **TTL** | 60 segundos | Balance entre frecuencia de cambios y carga en PostgreSQL |
| **Estrategia** | **Cache-Aside** | La API controla explícitamente cuándo leer y escribir al cache |
| **Invalidación** | `redis.del(CACHE_KEY)` en `POST /vacunas` | Al aplicar una vacuna, el dato cambia — se elimina inmediatamente para que el próximo GET traiga datos frescos |

El flujo Cache-Aside: en cada `GET /vacunacion-pendiente` se busca primero en Redis. Si existe (HIT) se devuelve el JSON cacheado. Si no (MISS) se consulta PostgreSQL, se guarda en Redis con TTL y se responde. El header `X-Cache: HIT/MISS` permite observar el comportamiento desde el frontend.

### 5. ¿Por qué separaste la API del frontend como aplicaciones independientes?

- **Resiliencia**: si el frontend cae o se redespliega, la API sigue funcionando. Si la API tiene un bug, el frontend falla graciosamente con un mensaje de error.  
- **Seguridad**: el frontend nunca tiene acceso directo a las credenciales de la base de datos ni a las variables de entorno sensibles (solo conoce `NEXT_PUBLIC_API_URL`).  
- **Escalabilidad**: cada capa puede escalarse independientemente.  
- **Buena práctica**: mantiene la separación de responsabilidades — el frontend es UI, la API es lógica de negocio y acceso a datos.

### 6. ¿Qué decidiste hacer diferente al schema base y por qué?

- **RLS en tres tablas**: `mascotas`, `vacunas_aplicadas` y `citas`. Se eligieron estas porque contienen datos clínico-sensibles. `inventario_vacunas` y `duenos` no tienen RLS porque recepción y veterinarios necesitan verlos completos.  
- **FORCE ROW LEVEL SECURITY**: se añadió `FORCE RLS` para que el propietario de la tabla (superuser) también pase por las políticas en sus roles descendientes.  
- **Política separada para recepción en mascotas y citas**: la recepción puede ver todas las mascotas (para agendar citas) pero las políticas del veterinario solo aplican al rol `veterinario`.
