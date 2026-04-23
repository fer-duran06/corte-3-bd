# Cuaderno de Ataques — Corte 3
## Sistema de Clínica Veterinaria

**Matricula:** 243827  
**Fecha:** Abril 2026

---

## Sección 1 — Tres ataques de SQL Injection que fallan

### Ataque 1: Login Bypass / Quote-escape clásico

**Pantalla:** Búsqueda de mascotas (`/mascotas`) — campo de texto libre "Buscar por nombre de mascota".

**Input exacto probado:**
```
' OR '1'='1
```

**Qué intentaba hacer:**  
Escapar el string de búsqueda para que la condición WHERE siempre sea verdadera y devuelva todos los registros sin importar el filtro RLS.

**Query maliciosa que se intentaba construir:**
```sql
-- Si el input se concatenara directamente:
SELECT * FROM mascotas WHERE nombre ILIKE '%' OR '1'='1%'
-- Resultado: devolvería todas las mascotas ignorando RLS
```

**Resultado: el ataque falló.**  
La API respondió con 0 resultados. El input fue tratado como texto literal — buscó una mascota cuyo nombre fuera literalmente `' OR '1'='1`, no existe ninguna.

**Línea exacta que defendió:**  
`api/src/routes/mascotas.ts`, línea 25:
```typescript
const parsed = BuscarSchema.safeParse(req.query);
```
Y línea 37:
```typescript
const termino = q ? `%${q}%` : '%';
```
Y líneas 38-46:
```typescript
return client.query(
    `SELECT m.id, m.nombre, m.especie, m.fecha_nacimiento,
    d.nombre AS dueno_nombre, d.telefono AS dueno_telefono
    FROM mascotas m
    JOIN duenos d ON d.id = m.dueno_id
    WHERE m.nombre ILIKE $1
    ORDER BY m.nombre`,
    [termino]
);
```
El valor `' OR '1'='1` entra como parámetro `$1` — el driver `pg` lo separa del SQL y PostgreSQL lo trata como dato literal, nunca como código ejecutable.

---

### Ataque 2: UNION-Based Injection (Extracción de datos)

**Pantalla:** Búsqueda de mascotas (`/mascotas`) — campo de texto libre.

**Input exacto probado:**
```
%' UNION SELECT id, cedula, cedula, cedula, cedula, cedula FROM veterinarios --
```

**Qué intentaba hacer:**  
Usar UNION para añadir una segunda query que extrajera las cédulas profesionales de los veterinarios mezcladas con los resultados de mascotas.

**Query maliciosa que se intentaba construir:**
```sql
-- Si el input se concatenara directamente:
SELECT m.id, m.nombre FROM mascotas m WHERE m.nombre ILIKE '%%' 
UNION SELECT id, cedula, cedula, cedula, cedula, cedula FROM veterinarios --'%'
-- Resultado: filtraría datos confidenciales de veterinarios
```

**Resultado: el ataque falló.**  
La API devolvió 0 resultados. El input completo fue tratado como un nombre de mascota literal.

**Línea exacta que defendió:**  
`api/src/routes/mascotas.ts`, líneas 8-11:
```typescript
const BuscarSchema = z.object({
    q: z.string().min(1).max(100).optional(),
    vet_id: z.coerce.number().int().positive(),
});
```
Zod limita el campo `q` a máximo 100 caracteres. El input llega como parámetro `$1` en líneas 38-46, PostgreSQL lo interpreta literalmente como texto de búsqueda ILIKE, haciendo imposible el UNION injection.

---

### Ataque 3: Stacked Query / Time-Based Injection

**Pantalla:** Búsqueda de mascotas (`/mascotas`) — campo de texto libre.

**Input exacto probado:**
```
Firulais'; SELECT pg_sleep(5); --
```

**Qué intentaba hacer:**  
Inyectar una segunda sentencia SQL que pausara el servidor 5 segundos para confirmar que la inyección funciona (time-based blind injection).

**Query maliciosa que se intentaba construir:**
```sql
-- Si el input se concatenara directamente:
SELECT * FROM mascotas WHERE nombre ILIKE '%Firulais'; SELECT pg_sleep(5); --%'
-- Resultado: el servidor tardaría 5 segundos confirmando la vulnerabilidad
```

**Resultado: el ataque falló.**  
La API respondió en menos de 50ms sin pausas. La búsqueda devolvió 0 resultados.

**Línea exacta que defendió:**  
`api/src/routes/mascotas.ts`, línea 10:
```typescript
vet_id: z.coerce.number().int().positive(),
```
Y líneas 43-45:
```typescript
WHERE m.nombre ILIKE $1
ORDER BY m.nombre`,
[termino]
```
El driver `pg` con queries parametrizadas no permite múltiples statements separados por `;`. El input `Firulais'; SELECT pg_sleep(5); --` se envía como un único valor de dato — PostgreSQL busca literalmente esa cadena en los nombres de mascotas.

---

## Sección 2 — Demostración de RLS en acción

### Mecanismo de identidad

La API inyecta el ID del veterinario en cada transacción:

```typescript
// api/src/db.ts, línea 53
await client.query(`SET LOCAL "app.current_vet_id" = '${vetId}'`);
```

Las políticas RLS leen ese valor con `current_setting('app.current_vet_id', true)::INT`.  
`SET LOCAL` garantiza que el valor solo existe dentro de la transacción actual.

### Política RLS aplicada a mascotas

```sql
CREATE POLICY pol_mascotas_select
    ON mascotas
    FOR SELECT
    TO veterinario
    USING (
        id IN (
            SELECT mascota_id
            FROM vet_atiende_mascota
            WHERE vet_id = current_setting('app.current_vet_id', true)::INT
              AND activa = TRUE
        )
    );
```

Esta política hace que cada veterinario solo vea las mascotas que tiene asignadas en `vet_atiende_mascota` con `activa = TRUE`.

### Demostración con outputs reales (ejecutados en Docker)

**Veterinario 1 — Dr. Fernando López Castro (vet_id=1):**

Desde el frontend: selecciona "Dr. Fernando López Castro" en la pantalla de login, navega a `/mascotas`. El sistema muestra 3 mascotas.

Verificación directa en psql:
```sql
SET app.current_vet_id = '1';
SET ROLE veterinario;
SELECT id, nombre FROM mascotas ORDER BY id;
```
```
 id |  nombre
----+----------
  1 | Firulais
  5 | Toby
  7 | Max
(3 rows)
```

**Veterinario 2 — Dra. Sofía García Velasco (vet_id=2):**

Desde el frontend: selecciona "Dra. Sofía García Velasco", navega a `/mascotas`. El sistema muestra 3 mascotas distintas.

Verificación directa en psql:
```sql
SET app.current_vet_id = '2';
SET ROLE veterinario;
SELECT id, nombre FROM mascotas ORDER BY id;
```
```
 id | nombre
----+--------
  2 | Misifú
  4 | Luna
  9 | Dante
(3 rows)
```

**Administrador (BYPASSRLS — ve todas las mascotas):**
```sql
SET ROLE administrador;
SELECT id, nombre FROM mascotas ORDER BY id;
```
```
 id |  nombre
----+----------
  1 | Firulais
  2 | Misifú
  3 | Rocky
  4 | Luna
  5 | Toby
  6 | Pelusa
  7 | Max
  8 | Coco
  9 | Dante
 10 | Mango
(10 rows)
```

**Explicación:** El mismo `SELECT * FROM mascotas` devuelve 3, 3 o 10 filas dependiendo del rol y el `app.current_vet_id` activo. La política `pol_mascotas_select` filtra automáticamente dentro de PostgreSQL — la API no añade ningún `WHERE` manual.

---

## Sección 3 — Demostración de caché Redis funcionando

### Configuración

| Parámetro | Valor | Justificación |
|---|---|---|
| **Key** | `vacunacion:pendiente` | Identifica el recurso de forma legible |
| **TTL** | 60 segundos | Con TTL muy bajo (ej. 5s) el caché no amortigua carga real. Con TTL muy alto (ej. 1h) los datos de vacunación quedan obsoletos demasiado tiempo. 60s es un balance razonable para un sistema clínico donde los cambios no ocurren por segundo. |
| **Estrategia** | Cache-Aside | La API controla explícitamente cuándo leer y escribir al caché |
| **Invalidación** | `redis.del(CACHE_KEY)` en `POST /vacunas` | Al aplicar una vacuna los datos cambian — se elimina la key inmediatamente |

**Línea de invalidación:**  
`api/src/routes/vacunas.ts`, línea 47:
```typescript
await redis.del(CACHE_KEY);
```

### Logs con timestamps

**Primera consulta — Cache MISS (datos desde PostgreSQL):**
```
[Redis] MISS — vacunacion:pendiente
```
Header de respuesta: `X-Cache: MISS`  
Latencia: ~80-200ms (consulta a PostgreSQL con JOIN sobre todas las mascotas y vacunas)

**Segunda consulta inmediata — Cache HIT (datos desde Redis):**
```
[Redis] HIT — vacunacion:pendiente
```
Header de respuesta: `X-Cache: HIT`  
Latencia: ~2-5ms (lectura en memoria desde Redis)

**POST de aplicación de vacuna — invalida el caché:**
```bash
POST /vacunas
Body: {"mascota_id":10,"vacuna_id":1,"veterinario_id":3,"costo_cobrado":350}
```
```
[Redis] Cache invalidado: vacunacion:pendiente
```

**Tercera consulta después de invalidación — Cache MISS de nuevo:**
```
[Redis] MISS — vacunacion:pendiente
```
Header: `X-Cache: MISS`  
La consulta va a PostgreSQL, obtiene datos frescos incluyendo la vacuna recién aplicada, y vuelve a guardar en Redis por 60 segundos más.

### Observación en el frontend

En la pantalla `/vacunacion`, el banner superior cambia de color:
- **Verde con rayo:** "Cache HIT — datos servidos desde Redis (TTL 60 s)"
- **Naranja con flechas:** "Cache MISS — datos consultados desde PostgreSQL y guardados en Redis"

El header `X-Cache` es visible en las DevTools del navegador (pestaña Red, seleccionar el request `vacunacion-pendiente`, sección Headers de respuesta).