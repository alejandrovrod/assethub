using System;

namespace AssetHub.Application.Interfaces;

public interface ICurrentUser
{
    Guid? Id { get; }

    /// <summary>
    /// Indica si el usuario autenticado tiene el rol <paramref name="role"/>.
    ///
    /// La implementación por defecto devuelve <c>false</c> a propósito: la interfaz la
    /// usan decenas de handlers y sus dobles de test. Agregar un miembro abstracto
    /// rompería todos esos fakes sin aportar nada —un fake que no conoce roles no debe
    /// concederlos—. Solo <c>CurrentUser</c> y los helpers que necesitan simular un rol
    /// de campo lo implementan de verdad.
    /// </summary>
    bool IsInRole(string role) => false;
}
