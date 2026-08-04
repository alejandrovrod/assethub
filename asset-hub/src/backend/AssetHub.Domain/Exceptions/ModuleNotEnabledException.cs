namespace AssetHub.Domain.Exceptions;

public class ModuleNotEnabledException : DomainException
{
    public ModuleNotEnabledException(string moduleName) 
        : base("module_not_enabled", $"El módulo '{moduleName}' no está habilitado en su plan actual.")
    {
    }
}
