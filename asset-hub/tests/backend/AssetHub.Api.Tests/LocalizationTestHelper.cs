using System.Globalization;
using AssetHub.Application.Resources;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Localization;

namespace AssetHub.Api.Tests;

/// <summary>
/// Helpers to exercise the shared message catalog from unit tests.
/// </summary>
public static class LocalizationTestHelper
{
    private static readonly ServiceProvider Provider = BuildProvider();

    private static ServiceProvider BuildProvider()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddLocalization();
        return services.BuildServiceProvider();
    }

    /// <summary>
    /// Pins both CurrentCulture and CurrentUICulture, the way
    /// UseRequestLocalization does for an incoming request.
    /// </summary>
    public static void SetCulture(string culture)
    {
        var info = CultureInfo.GetCultureInfo(culture);
        CultureInfo.CurrentCulture = info;
        CultureInfo.CurrentUICulture = info;
    }

    /// <summary>
    /// Builds a real localizer over SharedResource.resx so tests assert against
    /// the actual catalog instead of a stub.
    /// </summary>
    public static IStringLocalizer<SharedResource> CreateLocalizer() =>
        Provider.GetRequiredService<IStringLocalizer<SharedResource>>();

    /// <summary>Resolves a catalog key for the given culture in one call.</summary>
    public static string Resolve(string key, string culture)
    {
        SetCulture(culture);
        return CreateLocalizer()[key].Value;
    }
}
