using System;
using System.Collections.Generic;

namespace AssetHub.Application.Auth;

/// <summary>
/// Una clave pública del JWKS publicada en <c>GET /.well-known/jwks.json</c> (022 §6.2).
///
/// <c>N</c>/<c>E</c> son base64url sin padding, tal como los define RFC 7518 §6.3.1.
/// El DTO vive en Application y no en Infrastructure porque es parte del contrato HTTP:
/// el handler que emite el lease devuelve también estas claves, para que el cliente las
/// cachee en el mismo viaje en que todavía tiene red.
/// </summary>
public sealed record OfflineLeaseJwk(
    string Kty,
    string Use,
    string Alg,
    string Kid,
    string N,
    string E);

/// <summary>Documento JWKS: clave vigente + anterior durante el solape de rotación.</summary>
public sealed record OfflineLeaseJwks(IReadOnlyList<OfflineLeaseJwk> Keys);
