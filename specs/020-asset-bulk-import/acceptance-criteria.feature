# language: es
Característica: Importación Masiva e Histórica de Activos
  Como Administrador del Sistema o Gestor de Mantenimiento
  Quiero cargar archivos Excel o CSV con activos históricos y dinámicos
  Para poblar el inventario masivamente asegurando la integridad del esquema y del ciclo de vida

  Antecedentes:
    Dado que existe una plantilla de activo "Bomba Industrial" con esquema dinámico:
      """
      {
        "type": "object",
        "required": ["serial_number", "potencia_hp"],
        "properties": {
          "serial_number": { "type": "string" },
          "potencia_hp": { "type": "number", "minimum": 1 }
        }
      }
      """
    Y la plantilla tiene estado inicial "En Almacen" y permite estados ["En Almacen", "Instalado", "Operativo"]

  Escenario: Validación exitosa de activos históricos (Dry-Run)
    Dado un archivo Excel con las siguientes filas para la plantilla "Bomba Industrial":
      | Code    | Name               | State     | InstalledAt | CommissionedAt | serial_number | potencia_hp |
      | PUMP-01 | Bomba Impulsión A1 | Operativo | 2020-01-10  | 2020-02-15     | SN-99881      | 50          |
      | PUMP-02 | Bomba Impulsión A2 | Instalado | 2021-05-12  | 2021-06-01     | SN-99882      | 75          |
    Cuando envío el archivo al endpoint de validación "POST /api/v1/assets/import/validate"
    Entonces el resultado debe tener "totalRows" igual a 2
    Y "validRows" debe ser igual a 2
    Y "invalidRows" debe ser igual a 0
    Y no debe registrarse ningún error

  Escenario: Detección de errores en esquema dinámico y código duplicado
    Dado que en el sistema ya existe un activo con código "PUMP-01"
    Y un archivo Excel contiene:
      | Code    | Name               | State     | serial_number | potencia_hp |
      | PUMP-01 | Bomba Duplicada    | Operativo | SN-11111      | 15          |
      | PUMP-03 | Bomba Sin Serial   | Operativo |               | 20          |
    Cuando envío el archivo al endpoint de validación
    Entonces el resultado debe tener "validRows" igual a 0
    Y "invalidRows" igual a 2
    Y el error en la fila 1 debe indicar que el código "PUMP-01" ya existe
    Y el error en la fila 2 debe indicar que "serial_number" es requerido

  Escenario: Importación atómica con registro de evento histórico
    Dado un archivo válido con 1 fila para el activo "PUMP-10" con estado "Operativo" y fecha de puesta en marcha "2022-03-01"
    Cuando ejecuto la importación con "continueOnError: false"
    Entonces se crea el activo "PUMP-10" en la base de datos
    Y las propiedades dinámicas contienen {"serial_number": "SN-0010", "potencia_hp": 30}
    Y se registra un evento en "AssetLifecycleEvents" con tipo "migracion_historica" y fecha "2022-03-01"
