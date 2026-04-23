-- =============================================================
-- ROW-LEVEL SECURITY (RLS) · CORTE 3
-- Sistema de Clínica Veterinaria
-- =============================================================
--
-- Mecanismo de identidad elegido:
--   SET LOCAL app.current_vet_id = '<id>';
--   La API lo ejecuta dentro de cada transacción antes de
--   cualquier query. PostgreSQL expone ese valor vía:
--   current_setting('app.current_vet_id', true)
--   El segundo argumento (true) evita error si la variable no
--   existe y devuelve NULL en su lugar.
--
-- Roles con acceso completo (BYPASSRLS):
--   El rol 'administrador' recibe BYPASSRLS — ve todas las filas
--   sin que las políticas apliquen.
--
-- =============================================================

-- =============================================================
-- 1. BYPASSRLS para administrador
-- =============================================================
ALTER ROLE administrador BYPASSRLS;


-- =============================================================
-- 2. RLS en tabla MASCOTAS
-- Un veterinario solo ve las mascotas que tiene asignadas
-- en vet_atiende_mascota con activa = TRUE.
-- =============================================================

ALTER TABLE mascotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE mascotas FORCE ROW LEVEL SECURITY;

-- Política de lectura (SELECT): solo mascotas asignadas al vet actual
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

-- Recepción ve todas las mascotas (no maneja historial clínico)
CREATE POLICY pol_mascotas_select_recepcion
    ON mascotas
    FOR SELECT
    TO recepcion
    USING (TRUE);


-- =============================================================
-- 3. RLS en tabla VACUNAS_APLICADAS
-- Un veterinario solo ve las vacunas que él mismo aplicó.
-- =============================================================

ALTER TABLE vacunas_aplicadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE vacunas_aplicadas FORCE ROW LEVEL SECURITY;

-- SELECT: solo vacunas aplicadas por el vet actual
CREATE POLICY pol_vacunas_select
    ON vacunas_aplicadas
    FOR SELECT
    TO veterinario
    USING (
        veterinario_id = current_setting('app.current_vet_id', true)::INT
    );

-- INSERT: el vet solo puede insertar vacunas con su propio id
CREATE POLICY pol_vacunas_insert
    ON vacunas_aplicadas
    FOR INSERT
    TO veterinario
    WITH CHECK (
        veterinario_id = current_setting('app.current_vet_id', true)::INT
    );


-- =============================================================
-- 4. RLS en tabla CITAS
-- Un veterinario solo ve y modifica sus propias citas.
-- =============================================================

ALTER TABLE citas ENABLE ROW LEVEL SECURITY;
ALTER TABLE citas FORCE ROW LEVEL SECURITY;

-- SELECT: solo citas del vet actual
CREATE POLICY pol_citas_select
    ON citas
    FOR SELECT
    TO veterinario
    USING (
        veterinario_id = current_setting('app.current_vet_id', true)::INT
    );

-- INSERT: el vet solo puede agendar citas con su propio id
CREATE POLICY pol_citas_insert
    ON citas
    FOR INSERT
    TO veterinario
    WITH CHECK (
        veterinario_id = current_setting('app.current_vet_id', true)::INT
    );

-- UPDATE: el vet solo puede actualizar sus propias citas
CREATE POLICY pol_citas_update
    ON citas
    FOR UPDATE
    TO veterinario
    USING (
        veterinario_id = current_setting('app.current_vet_id', true)::INT
    )
    WITH CHECK (
        veterinario_id = current_setting('app.current_vet_id', true)::INT
    );

-- Recepción puede insertar citas pero no actualizar ni borrar
CREATE POLICY pol_citas_select_recepcion
    ON citas
    FOR SELECT
    TO recepcion
    USING (TRUE);

CREATE POLICY pol_citas_insert_recepcion
    ON citas
    FOR INSERT
    TO recepcion
    WITH CHECK (TRUE);


-- =============================================================
-- 5. VERIFICACIÓN
-- =============================================================
DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'RLS configurado correctamente:';
    RAISE NOTICE '  mascotas         — RLS habilitado';
    RAISE NOTICE '  vacunas_aplicadas — RLS habilitado';
    RAISE NOTICE '  citas            — RLS habilitado';
    RAISE NOTICE 'Mecanismo: SET LOCAL app.current_vet_id = <id>';
    RAISE NOTICE 'Bypass:    ALTER ROLE administrador BYPASSRLS';
    RAISE NOTICE '================================================';
END $$;
