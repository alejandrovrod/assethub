using System;

namespace AssetHub.Domain.Exceptions;

public class BusinessEntityTypeInUseException : Exception
{
    public BusinessEntityTypeInUseException()
    {
    }

    public BusinessEntityTypeInUseException(string message)
        : base(message)
    {
    }

    public BusinessEntityTypeInUseException(string message, Exception inner)
        : base(message, inner)
    {
    }
}
