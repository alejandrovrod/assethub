namespace AssetHub.Domain.Exceptions;

public class CatalogInUseException : DomainException
{
    public CatalogInUseException(string detail) 
        : base("catalog_in_use", $"El ítem de catálogo no se puede eliminar porque está en uso. {detail}")
    {
    }
}
