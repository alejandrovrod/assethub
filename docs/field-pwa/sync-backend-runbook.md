# Runbook: Sync Backend — Operaciones de campo

## Propósito

Guía operativa para el backend de sincronización offline (`field-sync-backend`, spec 022).
Cubre reenvío manual de requests, purga de idempotencia y rotación de llaves del lease.

---

## 1. Reenvío manual con la misma key

### Cuándo usarlo

Un técnico reporta que un consumo de material o una transición de estado no se refleja
en el servidor después de reconectarse. El outbox local muestra el item en `dead_letter`.

### Procedimiento

1. Identificar la `Idempotency-Key` del item fallido (está en el outbox del dispositivo,
   o en los logs del cliente: `outbox.item.failed` con `idempotencyKey`).
2. Verificar en la BD si ya existe un registro:

```sql
SELECT Id, TenantId, UserId, IdempotencyKey, Status, StatusCode, CreatedAt, CompletedAt
FROM tenant.HttpIdempotencyRecords
WHERE IdempotencyKey = '<key>';
```

3. **Si el registro existe con `Status = completed`**:
   - El servidor ya procesó el request. El cliente debería recibir el replay al reintentar.
   - Forzar un nuevo intento desde el dispositivo (botón "Reintentar" en el outbox).
   - El servidor responde con `Idempotent-Replay: true` y el mismo body original.

4. **Si el registro existe con `Status = in_progress`** y ya pasaron más de 1 minuto:
   - La ejecución original se colgó. Eliminar el registro manualmente:
     ```sql
     DELETE FROM tenant.HttpIdempotencyRecords
     WHERE IdempotencyKey = '<key>' AND Status = 'in_progress';
     ```
   - El cliente puede reintentar con la misma key.

5. **Si no existe registro**:
   - El request nunca llegó al servidor. Reintentar desde el dispositivo.
   - Si falla de nuevo, revisar logs de red/proxy.

### Riesgo

Eliminar un registro `in_progress` mientras la ejecución original sigue activa puede
causar duplicados. Verificar que no haya un request en vuelo antes de borrar.

---

## 2. Purga de idempotencia

### Worker automático

`IdempotencyCleanupWorker` corre diariamente y borra registros con
`CompletedAt < now - 72h`. No requiere intervención manual en operación normal.

### Purga manual (emergencia)

Si la tabla supera los 500 MB por tenant:

```sql
-- Borrar completados de más de 24 h (más agresivo que el worker)
DELETE FROM tenant.HttpIdempotencyRecords
WHERE Status = 'completed'
  AND CompletedAt < DATEADD(hour, -24, SYSUTCDATETIME());
```

**Nunca** purgar registros `in_progress` de menos de 1 hora.

### Métricas

- `idempotency.replay` — requests que se respondieron con replay
- `idempotency.conflict` — reutilización de key con payload distinto o in-progress
- Alerta si `idempotency.conflict` supera 10/min por tenant (posible cliente mal implementado)

---

## 3. Rotación de llaves del lease offline

### Arquitectura

El lease offline usa un anillo RSA propio (`OfflineLeaseKeyRing`), separado de la clave
HS256 del access token. El JWKS publica la clave actual + la anterior.

### Procedimiento de rotación (3 despliegues)

**Despliegue 1 — Publicar la clave nueva sin firmar:**
1. Generar nuevo par RSA.
2. Agregar la clave pública al JWKS (posición 1, sin firmar).
3. Desplegar. Los dispositivos cachean el JWKS (max-age 24h).

**Esperar > 24 horas** (para que todos los dispositivos tengan el JWKS actualizado).

**Despliegue 2 — Promover a índice 0:**
1. Mover la clave nueva a posición 0 (índice de firma).
2. Mantener la vieja en posición 1.
3. Desplegar. Los nuevos leases se firman con la clave nueva.

**Esperar 30 días** (leases de hasta 24h ya emitidos con la clave vieja expiran).

**Despliegue 3 — Retirar la vieja:**
1. Eliminar la clave vieja del anillo.
2. Desplegar.

### Rotación de emergencia (clave filtrada)

El lease no es revocable individualmente. Si una clave privada se filtra:

1. Ejecutar inmediatamente el Despliegue 2 (promover nueva clave).
2. Los leases firmados con la clave vieja siguen siendo válidos hasta que expiren
   (máximo 24h). No hay forma de revocarlos antes.
3. Documentar el incidente. Considerar reducir `offlineLeaseHours` temporalmente.

### Configuración

Las claves se configuran en `appsettings.json` o variables de entorno:

```json
{
  "OfflineLease": {
    "Keys": [
      { "Kid": "k-2026-10", "PrivateKeyPem": "..." },
      { "Kid": "k-2026-09", "PrivateKeyPem": "..." }
    ]
  }
}
```

Si no hay claves configuradas, se genera una efímera por proceso (solo para desarrollo).
Un reinicio invalida todos los leases emitidos con la clave efímera.

---

## 4. Verificación post-deploy

### Checklist

- [ ] Migración aplicada sin errores
- [ ] `IdempotencyCleanupWorker` registrado y corriendo
- [ ] JWKS accesible en `/.well-known/jwks.json` (anónimo, Cache-Control: public, max-age=86400)
- [ ] Métricas visibles en el dashboard: `idempotency.replay`, `idempotency.conflict`,
      `concurrency.precondition_failed`, `lease.issued`, `inventory.adjustment.missing_key`
- [ ] `apps/web` compila y funciona sin headers nuevos
- [ ] Test de fuga multi-tenant pasa en CI

### Comandos de verificación

```bash
# Verificar JWKS
curl -s https://api.assethub.com/.well-known/jwks.json | jq '.keys | length'

# Verificar métricas (si está expuesto)
curl -s https://api.assethub.com/metrics | grep idempotency
```

---

## 5. Troubleshooting

| Síntoma | Causa probable | Acción |
|---|---|---|
| `409 idempotency_key_reuse` | Cliente reutiliza key con payload distinto | Verificar que el cliente use la misma key para el mismo request |
| `409 request_in_progress` | Doble envío simultáneo | Esperar 1s y reintentar (Retry-After: 1) |
| `428 precondition_required` | Falta If-Match en endpoint estricto | El cliente debe enviar el ETag recibido en la lectura |
| `412 version_mismatch` | Escritura concurrente | Releer el recurso, reconciliar, reintentar con nuevo ETag |
| `400 idempotency_key_required` | Falta header en /consumptions | El cliente de campo debe enviar Idempotency-Key siempre |
| Lease no valida offline | JWKS cacheado obsoleto o clave rotada | Limpiar cache del dispositivo, reconectar para obtener JWKS fresco |
