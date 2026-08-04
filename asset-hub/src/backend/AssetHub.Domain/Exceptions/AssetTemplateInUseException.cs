using System;

namespace AssetHub.Domain.Exceptions;

public class AssetTemplateInUseException : Exception
{
    public AssetTemplateInUseException()
    {
    }

    public AssetTemplateInUseException(string message)
        : base(message)
    {
    }

    public AssetTemplateInUseException(string message, Exception inner)
        : base(message, inner)
    {
    }
}
