# Cuaderno de Ataques — Corte 3
## Sistema de Clínica Veterinaria

**Matrícula:** 243827  
**Fecha:** Abril 2026

---

## Sección 1 — Tres ataques de SQL Injection

### Ataque 1: Login Bypass (Classic Authentication Bypass)

**Objetivo:** Entrar al sistema sin credenciales válidas manipulando una query de autenticación.

**Escenario vulnerable (código que NO usamos):**
```javascript
// ❌ VULNERABLE — concatenación directa del input
const query = `SELECT * FROM veterinarios WHERE nombre = '${req.body.nombre}'`;
```

**Payload del ataque:**
```
nombre: ' OR '1'='1' --
```

**Query resultante (maliciosa):**
```sql
SELECT * FROM veterinarios WHERE nombre = '' OR '1'='1' --'
```

**Resultado sin protección:**  
La condición `'1'='1'` es siempre verdadera → devuelve todos los registros → el atacante entra como el primer usuario.

**Cómo lo protegemos:**
```javascript
// ✅ PROTEGIDO — parámetro $1 separado del SQL
const result = await client.query(
  'SELECT * FROM veterinarios WHERE nombre = $1',
  [req.body.nombre]
);
```
El driver `pg` envía el valor como parámetro binario separado. PostgreSQL lo trata como dato, nunca como SQL. El `' OR '1'='1'` se busca literalmente como nombre — no existe → devuelve 0 filas.

**Validación Zod adicional:**
```typescript
const schema = z.object({ nombre: z.string().min(1).max(100) });
```

---

### Ataque 2: UNION-Based Injection (Extracción de datos)

**Objetivo:** Usar UNION para extraer datos de otras tablas a través de un endpoint de búsqueda.

**Escenario vulnerable (código que NO usamos):**
```javascript
// ❌ VULNERABLE — q se concatena directamente
const query = `SELECT id, nombre FROM mascotas WHERE nombre ILIKE '%${req.query.q}%'`;
```

**Payload del ataque:**
```
q: %' UNION SELECT id, cedula FROM veterinarios --
```

**Query resultante (maliciosa):**
```sql
SELECT id, nombre FROM mascotas WHERE nombre ILIKE '%%' 
UNION SELECT id, cedula FROM veterinarios --'%'
```

**Resultado sin protección:**  
La respuesta incluiría cédulas profesionales de los veterinarios mezcladas con los nombres de mascotas — fuga de datos confidenciales.

**Cómo lo protegemos:**
```javascript
// ✅ PROTEGIDO — el % se construye en JS, el valor completo va como $1
const termino = `%${q}%`;
const result = await client.query(
  'SELECT id, nombre FROM mascotas WHERE nombre ILIKE $1',
  [termino]
);
```
El valor `%' UNION SELECT id, cedula FROM veterinarios --` se busca textualmente como nombre de mascota. No hay ninguna mascota con ese nombre → devuelve 0 filas. No hay inyección porque el SQL y el dato están completamente separados.

---

### Ataque 3: Time-Based Blind Injection (Inferencia por tiempo)

**Objetivo:** Confirmar vulnerabilidad y extraer datos bit a bit midiendo tiempos de respuesta, sin ver resultados directos.

**Escenario vulnerable (código que NO usamos):**
```javascript
// ❌ VULNERABLE
const query = `SELECT * FROM mascotas WHERE id = ${req.params.id}`;
```

**Payload del ataque:**
```
id: 1; SELECT pg_sleep(5) --
```

**Query resultante (maliciosa):**
```sql
SELECT * FROM mascotas WHERE id = 1; SELECT pg_sleep(5) --
```

**Resultado sin protección:**  
La respuesta tarda 5 segundos → el atacante confirma que la inyección funciona. Con variantes como:
```sql
1; SELECT CASE WHEN (SELECT COUNT(*) FROM veterinarios) > 3 THEN pg_sleep(5) ELSE pg_sleep(0) END --
```
puede extraer información lógica midiendo si la respuesta tarda o no.

**Cómo lo protegemos:**
```javascript
// ✅ PROTEGIDO — id validado como entero por Zod antes de llegar a la query
const schema = z.object({ id: z.coerce.number().int().positive() });
const { id } = schema.parse(req.params);

const result = await client.query(
  'SELECT * FROM mascotas WHERE id = $1',
  [id]
);
```
Zod rechaza el string `"1; SELECT pg_sleep(5) --"` porque no es un entero válido → error 400 antes de tocar la base de datos. Incluso si pasara, el paramétrico no permite múltiples statements.

---

## Sección 2 — Demostración de Row-Level Security

### Configuración

La tabla `vet_atiende_mascota` define qué veterinario atiende a cada mascota:
- **vet_id=1 (Dr. López):** Firulais, Toby, Max — 3 mascotas
- **vet_id=2 (Dra. García):** Misifú, Luna, Dante — 3 mascotas
- **vet_id=3 (Dr. Méndez):** Rocky, Pelusa, Coco, Mango — 4 mascotas

### Mecanismo de identidad

La API inyecta el ID del veterinario en cada transacción usando `SET LOCAL`:

```typescript
// api/src/db.ts
await client.query(`SET LOCAL "app.current_vet_id" = '${vetId}'`);
```

Las políticas RLS lo leen con `current_setting('app.current_vet_id', true)::INT`.  
`SET LOCAL` garantiza que el valor solo existe dentro de la transacción actual.

### Demostración con outputs reales

Los siguientes resultados fueron obtenidos directamente desde `psql` dentro del contenedor Docker:

**Paso 1 — Como Dr. López (vet_id=1):**
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

**Paso 2 — Como Dra. García (vet_id=2):**
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

**Paso 3 — Como administrador (BYPASSRLS):**
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

**Conclusión:** El mismo `SELECT * FROM mascotas` devuelve 3, 3 o 10 filas dependiendo del rol y el `app.current_vet_id` activo. El filtro ocurre dentro de PostgreSQL — el código de la API no necesita añadir `WHERE vet_id = ?` manualmente. Esto se verificó en tiempo real con el contenedor Docker corriendo.

---

## Sección 3 — Demostración de Caché Redis

### Configuración

| Parámetro | Valor | Justificación |
|---|---|---|
| **Clave** | `vacunacion:pendiente` | Identifica el recurso cacheado de forma legible |
| **TTL** | 60 segundos | Balance entre frecuencia de cambios y carga en PostgreSQL |
| **Estrategia** | Cache-Aside | La API controla explícitamente cuándo leer y escribir al cache |
| **Invalidación** | `redis.del(CACHE_KEY)` en `POST /vacunas` | Al aplicar una vacuna, el dato cambia — se elimina inmediatamente |

### Flujo Cache-Aside

```
GET /vacunacion-pendiente
        │
        ▼
  ¿Existe en Redis?
    /         \
  SÍ (HIT)   NO (MISS)
   │              │
   │         Consulta PostgreSQL
   │              │
   │         Guarda en Redis (TTL 60s)
   │              │
   └──── Responde al cliente ────┘
```

### Demostración

**Request 1 — Cache MISS (primera consulta, datos desde PostgreSQL):**
```bash
curl -I http://localhost:4000/vacunacion-pendiente
```
```
X-Cache: MISS
```
Log del servidor:
```
[Redis] MISS — vacunacion:pendiente
```

**Request 2 — Cache HIT (datos desde Redis):**
```bash
curl -I http://localhost:4000/vacunacion-pendiente
```
```
X-Cache: HIT
```
Log del servidor:
```
[Redis] HIT — vacunacion:pendiente
```

**Request 3 — Invalidación al aplicar vacuna:**
```bash
curl -X POST http://localhost:4000/vacunas \
  -H "Content-Type: application/json" \
  -d '{"mascota_id":10,"vacuna_id":1,"veterinario_id":3,"costo_cobrado":350}'
```
Log del servidor:
```
[Redis] Cache invalidado: vacunacion:pendiente
```

**Request 4 — Nuevo MISS tras invalidación:**
```bash
curl -I http://localhost:4000/vacunacion-pendiente
```
```
X-Cache: MISS
```

### Observación en el Frontend

En la pantalla de Vacunación, el banner superior cambia de color según el estado del caché:
- ⚡ **Verde: "Cache HIT"** — datos servidos desde Redis
- 🔄 **Naranja: "Cache MISS"** — datos consultados desde PostgreSQL

Al presionar "Refrescar" repetidamente se observa HIT; al esperar 60 segundos o aplicar una vacuna, el siguiente request muestra MISS.

El header `X-Cache` es visible en las DevTools del navegador (pestaña Red → Headers de respuesta) confirmando el comportamiento en tiempo real.