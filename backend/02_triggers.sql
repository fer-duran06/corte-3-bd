-- =============================================================
-- TRIGGERS · CORTE 3
-- Sistema de Clínica Veterinaria
-- =============================================================

CREATE OR REPLACE FUNCTION fn_trg_historial_cita()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO historial_movimientos (tipo, referencia_id, descripcion)
    VALUES (
        'CITA_AGENDADA',
        NEW.id,
        FORMAT('Cita agendada: mascota_id=%s, veterinario_id=%s, fecha=%s, motivo=%s',
            NEW.mascota_id,
            NEW.veterinario_id,
            NEW.fecha_hora,
            NEW.motivo)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_historial_cita
    AFTER INSERT ON citas
    FOR EACH ROW
    EXECUTE FUNCTION fn_trg_historial_cita();