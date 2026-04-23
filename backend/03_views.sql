-- =============================================================
-- VIEWS · CORTE 3
-- Sistema de Clínica Veterinaria
-- =============================================================

CREATE OR REPLACE VIEW v_mascotas_vacunacion_pendiente AS
SELECT
    m.id              AS mascota_id,
    m.nombre          AS mascota_nombre,
    m.especie,
    d.nombre          AS dueno_nombre,
    d.telefono        AS dueno_telefono,
    iv.nombre         AS vacuna_nombre,
    va.fecha_aplicacion,
    (va.fecha_aplicacion + INTERVAL '30 days')::DATE AS proxima_dosis_estimada
FROM mascotas m
JOIN duenos d ON d.id = m.dueno_id
LEFT JOIN vacunas_aplicadas va ON va.id = (
    SELECT id FROM vacunas_aplicadas
    WHERE mascota_id = m.id
    ORDER BY fecha_aplicacion DESC
    LIMIT 1
)
LEFT JOIN inventario_vacunas iv ON iv.id = va.vacuna_id
WHERE
    va.id IS NULL
    OR va.fecha_aplicacion <= (CURRENT_DATE - INTERVAL '30 days')
ORDER BY va.fecha_aplicacion ASC NULLS FIRST;