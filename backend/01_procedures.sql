-- =============================================================
-- PROCEDURES Y FUNCTIONS · CORTE 3
-- Sistema de Clínica Veterinaria
-- =============================================================

-- =============================================================
-- 1. sp_agendar_cita
-- =============================================================

CREATE OR REPLACE PROCEDURE sp_agendar_cita(
    p_mascota_id     INT,
    p_veterinario_id INT,
    p_fecha_hora     TIMESTAMP,
    p_motivo         TEXT,
    OUT p_cita_id    INT
)
LANGUAGE plpgsql AS $$
DECLARE
    v_vet_activo      BOOLEAN;
    v_dias_descanso   VARCHAR(50);
    v_dia_semana      TEXT;
    v_mascota_existe  BOOLEAN;
BEGIN
    -- Validar que la mascota existe
    SELECT EXISTS(SELECT 1 FROM mascotas WHERE id = p_mascota_id)
        INTO v_mascota_existe;

    IF NOT v_mascota_existe THEN
        RAISE EXCEPTION 'La mascota con id % no existe', p_mascota_id;
    END IF;

    -- Validar que el veterinario existe y está activo
    SELECT activo, dias_descanso
        INTO v_vet_activo, v_dias_descanso
        FROM veterinarios
        WHERE id = p_veterinario_id
        FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El veterinario con id % no existe', p_veterinario_id;
    END IF;

    IF v_vet_activo IS NOT TRUE THEN
        RAISE EXCEPTION 'El veterinario con id % no está activo', p_veterinario_id;
    END IF;

    -- Validar día de descanso
    -- Usamos EXTRACT(DOW) para obtener el día en número y mapeamos a español
    -- para que coincida con los valores guardados en dias_descanso
    v_dia_semana := CASE EXTRACT(DOW FROM p_fecha_hora)
        WHEN 0 THEN 'domingo'
        WHEN 1 THEN 'lunes'
        WHEN 2 THEN 'martes'
        WHEN 3 THEN 'miercoles'
        WHEN 4 THEN 'jueves'
        WHEN 5 THEN 'viernes'
        WHEN 6 THEN 'sabado'
    END;

    IF v_dias_descanso <> '' AND
       v_dia_semana = ANY(string_to_array(v_dias_descanso, ',')) THEN
        RAISE EXCEPTION 'El veterinario descansa los %. No se puede agendar para %',
            v_dias_descanso, v_dia_semana;
    END IF;

    -- Validar colisión de horario (mismo vet, mismo fecha_hora)
    IF EXISTS (
        SELECT 1 FROM citas
        WHERE veterinario_id = p_veterinario_id
          AND fecha_hora = p_fecha_hora
          AND estado <> 'CANCELADA'
    ) THEN
        RAISE EXCEPTION 'El veterinario ya tiene una cita agendada para esa fecha y hora';
    END IF;

    -- Insertar la cita
    INSERT INTO citas (mascota_id, veterinario_id, fecha_hora, motivo, estado)
    VALUES (p_mascota_id, p_veterinario_id, p_fecha_hora, p_motivo, 'AGENDADA')
    RETURNING id INTO p_cita_id;

EXCEPTION
    WHEN OTHERS THEN
        RAISE;
END;
$$;


-- =============================================================
-- 2. fn_total_facturado
-- =============================================================

CREATE OR REPLACE FUNCTION fn_total_facturado(
    p_mascota_id INT,
    p_anio       INT
)
RETURNS NUMERIC AS $$
DECLARE
    v_total_citas   NUMERIC;
    v_total_vacunas NUMERIC;
BEGIN
    -- Suma de citas completadas en el año
    SELECT COALESCE(SUM(costo), 0)
        INTO v_total_citas
        FROM citas
        WHERE mascota_id = p_mascota_id
          AND estado = 'COMPLETADA'
          AND EXTRACT(YEAR FROM fecha_hora) = p_anio;

    -- Suma de vacunas aplicadas en el año
    SELECT COALESCE(SUM(costo_cobrado), 0)
        INTO v_total_vacunas
        FROM vacunas_aplicadas
        WHERE mascota_id = p_mascota_id
          AND EXTRACT(YEAR FROM fecha_aplicacion) = p_anio;

    RETURN v_total_citas + v_total_vacunas;
END;
$$ LANGUAGE plpgsql;