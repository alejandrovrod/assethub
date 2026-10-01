# Operación: Gestión de Limpieza, Higiene y Sanitización en Instalaciones

Este paquete define y documenta la configuración implementada en la base de datos de **AssetHub** para modelar edificios, pisos, baños, oficinas y equipos de limpieza como activos dentro de la jerarquía de la plataforma.

---

## 1. Jerarquía Estructural de Activos Físicos (M08)

El modelo replica con exactitud la infraestructura física de cualquier negocio o inmueble:

```
🏢 Edificio / Sede (`TPL_BUILDING`)
   └── 🏬 Piso / Nivel (`TPL_FLOOR`)
        ├── 🚻 Baño / Sanitario (`TPL_RESTROOM`)
        ├── 💼 Oficina / Sala de Juntas (`TPL_OFFICE_ROOM`)
        ├── 🚪 Área Genérica / Zona (`TPL_FACILITY_ZONE`)
        └── 🧹 Maquinaria / Equipo Mayor (`TPL_CLEANING_EQUIPMENT`)
```

Las relaciones de plantillas hijas (`AllowedChildTemplateIds`) quedaron enlazadas para que la creación en el árbol solo permita hijos válidos según su nivel.

---

## 2. Plantillas de Activo y Máquinas de Estados (Lifecycle States)

### A. Edificio / Sede Inmobiliaria (`TPL_BUILDING`)
* **Propósito**: Contenedor raíz para sedes corporativas, plazas comerciales o plantas industriales.
* **Campos dinámicos**: Nombre de sede, dirección, cantidad de pisos, superficie total (m²), administrador de sede, horario operativo.
* **Ciclo de Vida**:
  - `Operativo` (#10b981) ⇄ `Mantenimiento_General` (#f59e0b)
  - `Operativo` / `Mantenimiento_General` ⇄ `Fuera_De_Servicio` (#ef4444)
* **Checklist**: Inspección de accesos/fachadas, cuartos de basura y presurizadores de agua.

---

### B. Piso / Nivel Arquitectónico (`TPL_FLOOR`)
* **Propósito**: Agrupador intermedio para pisos o alas del edificio.
* **Campos dinámicos**: Número de piso, superficie del piso (m²), líder de cuadrilla asignado, ubicación de la estación o carrito de limpieza.
* **Ciclo de Vida**:
  - `Habilitado` (#10b981) ⇄ `En_Jornada_Limpieza` (#3b82f6)
  - `Habilitado` ⇄ `Clausurado_Temporal` (#ef4444)
* **Checklist**: Pasillos generales, escaleras de emergencia, pileta de trapeadores y vaciado de papeleras de tránsito.

---

### C. Baño / Sanitario Público o Corporativo (`TPL_RESTROOM`)
* **Propósito**: Espacio de alta rotación enfocado en desinfección bactericida y reposición continua de consumibles.
* **Campos dinámicos**: Identificador de baño, género (Mixto/Damas/Caballeros/Accesible), conteo de inodoros/urinarios/lavabos, personal asignado, hora de última intervención, banderas de confirmación (`soap_refilled`, `paper_refilled`), foto de evidencia testigo.
* **Ciclo de Vida de Estados**:
  - `Limpio_Habilitado` (#10b981) → Pasa a `Requiere_Atencion` o `En_Limpieza`.
  - `Requiere_Atencion` (#ef4444) → Dispara `onEnterAction: NOTIFY_CLEANING_CREW`, pasa a `En_Limpieza` o `Clausurado_Incidencia`.
  - `En_Limpieza` (#f59e0b) → Requiere campo `assigned_cleaner`, pasa a `En_Inspeccion`.
  - `En_Inspeccion` (#8b5cf6) → Requiere validación de `soap_refilled` y `paper_refilled`; aprueba a `Limpio_Habilitado` o rechaza a `Requiere_Atencion`.
  - `Clausurado_Incidencia` (#dc2626) → Por fuga, rotura o desborde; requiere campo `service_notes`.
* **Checklist de Mantenimiento / Rutina**:
  1. Retirar residuos higiénicos y colocar bolsa nueva calibre 600.
  2. Limpiar y desinfectar inodoros, tapas y urinarios con químico clorado/germicida.
  3. Desinfectar grifería, perillas y manijas.
  4. Rellenar dispensadores de jabón líquido.
  5. Reponer papel higiénico institucional y toallas interdobladas.
  6. Trapeado húmedo con amonio y neutralizador de olores.

---

### D. Oficina / Sala de Juntas (`TPL_OFFICE_ROOM`)
* **Propósito**: Espacios administrativos, privados o salas de reuniones.
* **Campos dinámicos**: Código de oficina, tipo de espacio (Privada, Open Space, Sala de Juntas), puestos de trabajo, bandera de alfombra, responsable, personal de limpieza asignado, fecha de desinfección, banderas de `dusting_completed` y `trash_emptied`.
* **Ciclo de Vida**:
  - `Limpio_Disponible` (#10b981) ⇄ `En_Uso_Reunion` (#3b82f6)
  - `Limpio_Disponible` / `En_Uso_Reunion` → `Requiere_Limpieza` (#ef4444)
  - `Requiere_Limpieza` → `En_Limpieza` (#f59e0b) → `Limpio_Disponible` (#10b981)
* **Checklist**: Vaciado de papeleras, retiro de polvo de escritorios y mesas sin alterar documentación, desinfección de teléfonos/teclados, limpieza de vidrios y aspirado de alfombra o mopa en pisos duros.

---

### E. Equipo Mayor de Limpieza Industrial (`TPL_CLEANING_EQUIPMENT`)
* **Propósito**: Maquinaria auxiliar (fregadoras, barredoras, hidrolavadoras, aspiradoras industriales).
* **Campos dinámicos**: Número de serie, marca, modelo, horómetro de operación, operador asignado, capacidad de tanque (L), estado de baterías.
* **Ciclo de Vida**: `Operativo` ⇄ `En_Uso` ⇄ `En_Mantenimiento` → `Baja_Tecnica`.

---

## 3. Catálogos Asociados (M05)

- **`CLEANING_SUPPLIES`**: Químicos e insumos codificados (`CHEM-CLOR-01`, `CHEM-QUAT-02`, `CHEM-SOAP-03`, `CONS-BAG-90120`, `CONS-MICROFIBER`, `CONS-MOP-HEAD`).
- **`BIO_RISK_LEVEL`**: Niveles de riesgo biológico (`RISK_LOW`, `RISK_MEDIUM`, `RISK_HIGH`).
- **`CLEANING_FREQUENCY`**: Frecuencias de atención (`FREQ_PER_SHIFT`, `FREQ_DAILY`, `FREQ_WEEKLY_DEEP`, `FREQ_MONTHLY_DISINFECT`).

---

## 4. Almacén e Inventario de Limpieza (M20)

- **Almacén**: `WH-CLEANING-01` (Almacén Central de Químicos e Higiene).
- **Modo**: `Hybrid` activo para permitir consumos directos de stock o compras externas de insumos.
