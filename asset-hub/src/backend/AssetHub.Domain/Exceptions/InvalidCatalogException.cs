using System;

namespace AssetHub.Domain.Exceptions;

public class InvalidCatalogException : Exception
{
    public InvalidCatalogException()
    {
    }

    public InvalidCatalogException(string message)
        : base(message)
    {
    }

    public InvalidCatalogException(string message, Exception inner)
        : base(message, inner)
    {
    }
}
