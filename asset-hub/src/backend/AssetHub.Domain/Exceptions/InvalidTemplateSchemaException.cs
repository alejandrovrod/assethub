using System;

namespace AssetHub.Domain.Exceptions;

public class InvalidTemplateSchemaException : Exception
{
    public InvalidTemplateSchemaException()
    {
    }

    public InvalidTemplateSchemaException(string message)
        : base(message)
    {
    }

    public InvalidTemplateSchemaException(string message, Exception inner)
        : base(message, inner)
    {
    }
}
