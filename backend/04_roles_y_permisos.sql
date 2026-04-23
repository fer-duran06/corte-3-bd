-- =============================================================
-- ROLES Y PERMISOS · CORTE 3
-- Sistema de Clínica Veterinaria
-- =============================================================

-- =============================================================
-- 1. Crear roles
-- =============================================================

DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'veterinario') THEN
        CREATE ROLE veterinario;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'recepcion') THEN
        CREATE ROLE recepcion;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'administrador') THEN
        CREATE ROLE administrador;
    END IF;
END $$;

-- =============================================================
-- 2. Permisos por rol (least privilege)
-- =============================================================

-- VETERINARIO: solo lo que necesita para atender mascotas
GRANT SELECT ON mascotas TO veterinario;
GRANT SELECT ON duenos TO veterinario;
GRANT SELECT ON citas TO veterinario;
GRANT INSERT, UPDATE ON citas TO veterinario;
GRANT SELECT ON inventario_vacunas TO veterinario;
GRANT SELECT, INSERT ON vacunas_aplicadas TO veterinario;
GRANT SELECT ON historial_movimientos TO veterinario;
GRANT SELECT ON vet_atiende_mascota TO veterinario;
GRANT SELECT ON v_mascotas_vacunacion_pendiente TO veterinario;

-- RECEPCION: agenda citas y consulta, no puede modificar historial ni vacunas
GRANT SELECT ON mascotas TO recepcion;
GRANT SELECT ON duenos TO recepcion;
GRANT SELECT, INSERT ON citas TO recepcion;
GRANT SELECT ON veterinarios TO recepcion;
GRANT SELECT ON inventario_vacunas TO recepcion;
GRANT SELECT ON v_mascotas_vacunacion_pendiente TO recepcion;

-- ADMINISTRADOR: acceso total
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO administrador;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO administrador;
GRANT ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public TO administrador;