using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.AssetArchitect;
using AssetHub.Application.AssetArchitect.Queries;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Catalogs;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace AssetHub.Api.Tests.AssetArchitect;

public class GenerateAssetTemplateDraftQueryHandlerTests
{
    private static ITenantDbContext CreateMockTenantDbContext(List<Catalog> catalogs)
    {
        var mockSet = CreateMockDbSet(catalogs);
        var mockContext = new Mock<ITenantDbContext>();
        mockContext.Setup(c => c.Catalogs).Returns(mockSet.Object);
        return mockContext.Object;
    }

    private static Mock<DbSet<Catalog>> CreateMockDbSet(List<Catalog> sourceList)
    {
        var queryable = sourceList.AsQueryable();
        var mockSet = new Mock<DbSet<Catalog>>();
        mockSet.As<IAsyncEnumerable<Catalog>>()
            .Setup(m => m.GetAsyncEnumerator(It.IsAny<CancellationToken>()))
            .Returns(new TestAsyncEnumerator<Catalog>(queryable.GetEnumerator()));
        mockSet.As<IQueryable<Catalog>>().Setup(m => m.Provider).Returns(new TestAsyncQueryProvider<Catalog>(queryable.Provider));
        mockSet.As<IQueryable<Catalog>>().Setup(m => m.Expression).Returns(queryable.Expression);
        mockSet.As<IQueryable<Catalog>>().Setup(m => m.ElementType).Returns(queryable.ElementType);
        mockSet.As<IQueryable<Catalog>>().Setup(m => m.GetEnumerator()).Returns(queryable.GetEnumerator());
        return mockSet;
    }

    [Fact]
    public async Task Handle_WhenDescriptionIsEmpty_ThrowsArgumentException()
    {
        var agent = new Mock<IAssetArchitectAgent>();
        var db = new Mock<ITenantDbContext>();
        var handler = new GenerateAssetTemplateDraftQueryHandler(agent.Object, db.Object, NullLogger<GenerateAssetTemplateDraftQueryHandler>.Instance);

        await Assert.ThrowsAsync<ArgumentException>(() => handler.Handle(new GenerateAssetTemplateDraftQuery("   "), CancellationToken.None));
    }

    [Fact]
    public async Task Handle_WhenDraftIsValid_ReturnsCompiledTemplateResults()
    {
        var mockAgent = new Mock<IAssetArchitectAgent>();
        var validDraft = new AssetArchitectDraft
        {
            Templates = new List<TemplateDraft>
            {
                new()
                {
                    Code = "TEST_FORKLIFT",
                    Name = "Test Forklift",
                    Description = "Warehouse electric forklift",
                    InitialState = "READY",
                    States = new List<StateDraft>
                    {
                        new() { Name = "READY", Transitions = new List<string> { "OUT_OF_SERVICE" } },
                        new() { Name = "OUT_OF_SERVICE", IsTerminal = true, Transitions = new List<string>() }
                    },
                    Fields = new List<FieldDraft>
                    {
                        new() { KeyName = "lifting_capacity_kg", Title = "Lifting Capacity (kg)", Type = "number", Required = true }
                    },
                    MaintenanceTasks = new List<ChecklistTaskDraft>
                    {
                        new() { Title = "Hydraulic check", Description = "Check fluid level", Frequency = "Weekly" }
                    }
                }
            }
        };

        mockAgent
            .Setup(a => a.GenerateDraftAsync(It.IsAny<AssetArchitectRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(validDraft);

        var catalogs = new List<Catalog>();
        var db = CreateMockTenantDbContext(catalogs);
        var handler = new GenerateAssetTemplateDraftQueryHandler(mockAgent.Object, db, NullLogger<GenerateAssetTemplateDraftQueryHandler>.Instance);

        var response = await handler.Handle(new GenerateAssetTemplateDraftQuery("Need electric forklifts"), CancellationToken.None);

        Assert.NotNull(response);
        Assert.Single(response.Templates);
        var t = response.Templates[0];
        Assert.Equal("TEST_FORKLIFT", t.Code);
        Assert.Equal("Test Forklift", t.Name);
        Assert.NotEmpty(t.SchemaJson);
        Assert.Equal("READY", t.InitialState);
        Assert.NotEmpty(t.MaintenanceChecklistJson);
        Assert.Single(t.Fields);
        Assert.Equal("lifting_capacity_kg", t.Fields[0].KeyName);
    }
}

internal class TestAsyncEnumerator<T> : IAsyncEnumerator<T>
{
    private readonly IEnumerator<T> _inner;
    public TestAsyncEnumerator(IEnumerator<T> inner) => _inner = inner;
    public ValueTask DisposeAsync() { _inner.Dispose(); return ValueTask.CompletedTask; }
    public ValueTask<bool> MoveNextAsync() => ValueTask.FromResult(_inner.MoveNext());
    public T Current => _inner.Current;
}

internal class TestAsyncQueryProvider<TEntity> : Microsoft.EntityFrameworkCore.Query.IAsyncQueryProvider
{
    private readonly IQueryProvider _inner;
    internal TestAsyncQueryProvider(IQueryProvider inner) => _inner = inner;
    public IQueryable CreateQuery(System.Linq.Expressions.Expression expression) => new TestAsyncEnumerable<TEntity>(expression);
    public IQueryable<TElement> CreateQuery<TElement>(System.Linq.Expressions.Expression expression) => new TestAsyncEnumerable<TElement>(expression);
    public object? Execute(System.Linq.Expressions.Expression expression) => _inner.Execute(expression);
    public TResult Execute<TResult>(System.Linq.Expressions.Expression expression) => _inner.Execute<TResult>(expression);
    public TResult ExecuteAsync<TResult>(System.Linq.Expressions.Expression expression, CancellationToken cancellationToken = default)
    {
        var expectedResultType = typeof(TResult).GetGenericArguments()[0];
        var executionResult = typeof(IQueryProvider)
            .GetMethods()
            .First(m => m.Name == nameof(IQueryProvider.Execute) && m.IsGenericMethod)
            .MakeGenericMethod(expectedResultType)
            .Invoke(_inner, new object[] { expression });

        return (TResult)typeof(Task).GetMethod(nameof(Task.FromResult))!
            .MakeGenericMethod(expectedResultType)
            .Invoke(null, new[] { executionResult })!;
    }
}

internal class TestAsyncEnumerable<T> : EnumerableQuery<T>, IAsyncEnumerable<T>, IQueryable<T>
{
    public TestAsyncEnumerable(IEnumerable<T> enumerable) : base(enumerable) { }
    public TestAsyncEnumerable(System.Linq.Expressions.Expression expression) : base(expression) { }
    public IAsyncEnumerator<T> GetAsyncEnumerator(CancellationToken cancellationToken = default) => new TestAsyncEnumerator<T>(this.AsEnumerable().GetEnumerator());
    IQueryProvider IQueryable.Provider => new TestAsyncQueryProvider<T>(this);
}
