using System;
using System.Collections.Generic;
using System.Text.Json;
using AssetHub.Domain.AssetTemplates;
using AssetHub.Domain.Catalogs;
using AssetHub.Domain.EntityTypes;
using AssetHub.Application.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace AssetHub.Infrastructure.Persistence;

public class TenantDbContext : DbContext, ITenantDbContext
{
    private readonly ITenantResolver _tenantResolver;

    public TenantDbContext(DbContextOptions<TenantDbContext> options, ITenantResolver tenantResolver) : base(options)
    {
        _tenantResolver = tenantResolver;
    }

    private Guid? CurrentTenantId => _tenantResolver.GetCurrentTenantId();

    public DbSet<Catalog> Catalogs { get; set; } = null!;
    public DbSet<CatalogItem> CatalogItems { get; set; } = null!;
    public DbSet<CatalogItemTranslation> CatalogItemTranslations { get; set; } = null!;
    public DbSet<BusinessEntityType> BusinessEntityTypes { get; set; } = null!;
    public DbSet<AssetTemplate> AssetTemplates { get; set; } = null!;
    public DbSet<AssetHub.Domain.WorkflowTemplates.WorkflowTemplate> WorkflowTemplates { get; set; } = null!;
    
    public DbSet<AssetHub.Domain.Assets.Asset> Assets { get; set; } = null!;
    public DbSet<AssetHub.Domain.Assets.AssetConditionHistory> AssetConditionHistories { get; set; } = null!;
    public DbSet<AssetHub.Domain.Assets.AssetHierarchy> AssetHierarchies { get; set; } = null!;
    public DbSet<AssetHub.Domain.Assets.AssetAttachment> AssetAttachments { get; set; } = null!;
    public DbSet<AssetHub.Domain.Assets.AssetLifecycleEvent> AssetLifecycleEvents { get; set; } = null!;
    public DbSet<AssetHub.Domain.Assets.AssetAttributeValue> AssetAttributeValues { get; set; } = null!;
    public DbSet<AssetHub.Domain.Assets.AssetHealthPrediction> AssetHealthPredictions { get; set; } = null!;
    public DbSet<AssetHub.Domain.Assets.AssetMaterial> AssetMaterials { get; set; } = null!;

    public DbSet<AssetHub.Domain.Incidents.Incident> Incidents { get; set; } = null!;
    public DbSet<AssetHub.Domain.Incidents.IncidentAttachment> IncidentAttachments { get; set; } = null!;
    public DbSet<AssetHub.Domain.Incidents.IncidentLifecycleEvent> IncidentLifecycleEvents { get; set; } = null!;
    public DbSet<AssetHub.Domain.Maintenance.PreventivePlan> PreventivePlans { get; set; } = null!;
    public DbSet<AssetHub.Domain.Maintenance.PreventivePlanExecutionLog> PreventivePlanExecutionLogs { get; set; } = null!;

    public DbSet<AssetHub.Domain.Maintenance.MaintenanceOrder> MaintenanceOrders { get; set; } = null!;
    public DbSet<AssetHub.Domain.Maintenance.MaintenancePart> MaintenanceParts { get; set; } = null!;
    public DbSet<AssetHub.Domain.Analytics.CostEntry> CostEntries { get; set; } = null!;

    public DbSet<AssetHub.Domain.Inventory.TenantInventorySettings> TenantInventorySettings { get; set; } = null!;
    public DbSet<AssetHub.Domain.Inventory.Warehouse> Warehouses { get; set; } = null!;
    public DbSet<AssetHub.Domain.Inventory.StockBalance> StockBalances { get; set; } = null!;
    public DbSet<AssetHub.Domain.Inventory.InventoryTransaction> InventoryTransactions { get; set; } = null!;

    public DbSet<AssetHub.Domain.Notifications.Notification> Notifications { get; set; } = null!;

    public DbSet<AssetHub.Domain.Staff.Employee> Employees { get; set; } = null!;
    public DbSet<AssetHub.Domain.Staff.EmployeeAvailability> EmployeeAvailabilities { get; set; } = null!;
    public DbSet<AssetHub.Domain.Staff.Team> Teams { get; set; } = null!;
    public DbSet<AssetHub.Domain.Staff.TeamMember> TeamMembers { get; set; } = null!;

    public DbSet<AssetHub.Domain.Tasks.WorkTask> WorkTasks { get; set; } = null!;
    public DbSet<AssetHub.Domain.Tasks.TaskRecurrence> TaskRecurrences { get; set; } = null!;
    public DbSet<AssetHub.Domain.Tasks.TaskStatusHistory> TaskStatusHistories { get; set; } = null!;
    public DbSet<AssetHub.Domain.Tasks.TaskEvidence> TaskEvidences { get; set; } = null!;
    public DbSet<AssetHub.Domain.Tasks.TaskComment> TaskComments { get; set; } = null!;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("tenant");

        modelBuilder.Entity<Catalog>(b =>
        {
            b.HasKey(c => c.Id);
            // Filtro Global: Trae los del tenant actual o los globales (TenantId = null)
            b.HasQueryFilter(c => c.TenantId == CurrentTenantId || c.TenantId == null);
            b.HasIndex(c => new { c.Code, c.TenantId }).IsUnique();
        });

        modelBuilder.Entity<CatalogItem>(b =>
        {
            b.HasKey(ci => ci.Id);
            // Filtro Global: Trae los del tenant actual o los globales (TenantId = null) y que no estén borrados lógicamente
            b.HasQueryFilter(ci => !ci.IsDeleted && (ci.TenantId == CurrentTenantId || ci.TenantId == null));
            b.HasIndex(ci => new { ci.CatalogId, ci.Code, ci.TenantId }).IsUnique();
        });

        modelBuilder.Entity<CatalogItemTranslation>(b =>
        {
            b.HasKey(t => t.Id);
            b.HasIndex(t => new { t.CatalogItemId, t.Locale }).IsUnique();
        });

        var stringListConverter = new ValueConverter<List<string>, string>(
            v => JsonSerializer.Serialize(v, (JsonSerializerOptions?)null),
            v => JsonSerializer.Deserialize<List<string>>(v, (JsonSerializerOptions?)null) ?? new List<string>()
        );

        var guidListConverter = new ValueConverter<List<Guid>, string>(
            v => JsonSerializer.Serialize(v, (JsonSerializerOptions?)null),
            v => JsonSerializer.Deserialize<List<Guid>>(v, (JsonSerializerOptions?)null) ?? new List<Guid>()
        );

        modelBuilder.Entity<BusinessEntityType>(b =>
        {
            b.HasKey(e => e.Id);
            b.HasQueryFilter(e => e.IsActive && (e.TenantId == CurrentTenantId || e.TenantId == null));
            b.HasIndex(e => new { e.Code, e.TenantId }).IsUnique();
            
            b.Property(e => e.EnabledModules).HasConversion(stringListConverter);
            b.Property(e => e.DefaultCatalogIds).HasConversion(guidListConverter);
        });

        var lifecycleConfigConverter = new ValueConverter<AssetHub.Domain.AssetTemplates.LifecycleConfig, string>(
            v => JsonSerializer.Serialize(v, (JsonSerializerOptions?)null),
            v => JsonSerializer.Deserialize<AssetHub.Domain.AssetTemplates.LifecycleConfig>(v, (JsonSerializerOptions?)null) ?? new AssetHub.Domain.AssetTemplates.LifecycleConfig()
        );

        modelBuilder.Entity<AssetTemplate>(b =>
        {
            b.HasKey(t => t.Id);
            b.HasQueryFilter(t => t.TenantId == CurrentTenantId || t.TenantId == null);
            
            // Un template code no es único solo por Tenant, sino por Code + TenantId + Version
            // Aunque si hacemos soft-delete o creamos nuevas versiones, Code se repite.
            b.HasIndex(t => new { t.Code, t.Version, t.TenantId }).IsUnique();

            b.Property(t => t.AllowedChildTemplateIds).HasConversion(guidListConverter);
            b.Property(t => t.LifecycleStates).HasConversion(lifecycleConfigConverter);

            b.HasOne(t => t.BusinessEntityType)
             .WithMany()
             .HasForeignKey(t => t.BusinessEntityTypeId)
             .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AssetHub.Domain.WorkflowTemplates.WorkflowTemplate>(b =>
        {
            b.HasKey(t => t.Id);
            b.HasQueryFilter(t => t.TenantId == CurrentTenantId);
            b.HasIndex(t => new { t.Code, t.Version, t.TenantId }).IsUnique();

            b.Property(t => t.LifecycleStates).HasConversion(lifecycleConfigConverter);
        });

        modelBuilder.Entity<AssetHub.Domain.Assets.Asset>(b =>
        {
            b.HasKey(a => a.Id);
            b.HasQueryFilter(a => a.TenantId == CurrentTenantId && !a.IsDeleted);
            b.HasIndex(a => new { a.Code, a.TenantId }).IsUnique();
            b.HasIndex(a => new { a.TenantId, a.Path });
            b.HasIndex(a => new { a.TenantId, a.ParentId });

            b.HasOne(a => a.Parent).WithMany().HasForeignKey(a => a.ParentId).OnDelete(DeleteBehavior.Restrict);

            b.HasMany(a => a.Incidents).WithOne(i => i.Asset).HasForeignKey(i => i.AssetId).OnDelete(DeleteBehavior.Restrict);
            b.HasMany(a => a.MaintenanceOrders).WithOne(m => m.Asset).HasForeignKey(m => m.AssetId).OnDelete(DeleteBehavior.Restrict);
            b.HasMany(a => a.WorkTasks).WithOne(t => t.Asset).HasForeignKey(t => t.AssetId).OnDelete(DeleteBehavior.Restrict);
            b.HasMany(a => a.PreventivePlans).WithOne(p => p.Asset).HasForeignKey(p => p.AssetId).OnDelete(DeleteBehavior.Restrict);
            b.HasMany(a => a.HealthPredictions).WithOne(p => p.Asset).HasForeignKey(p => p.AssetId).OnDelete(DeleteBehavior.Cascade);
            b.HasMany(a => a.Materials).WithOne(m => m.Asset).HasForeignKey(m => m.AssetId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AssetHub.Domain.Assets.AssetMaterial>(b =>
        {
            b.HasKey(m => m.Id);
            b.HasQueryFilter(m => m.TenantId == CurrentTenantId && !m.IsDeleted);
            
            // Unique index for the BOM (TenantId, AssetId, CatalogItemId) excluding deleted items
            b.HasIndex(m => new { m.TenantId, m.AssetId, m.CatalogItemId })
             .IsUnique()
             .HasFilter("\"IsDeleted\" = 0");
             
            b.HasIndex(m => new { m.TenantId, m.AssetId });
            
            b.Property(m => m.Quantity).HasPrecision(18, 4);

            b.HasOne(m => m.CatalogItem).WithMany().HasForeignKey(m => m.CatalogItemId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AssetHub.Domain.Assets.AssetHealthPrediction>(b =>
        {
            b.HasKey(p => p.Id);
            b.HasQueryFilter(p => p.TenantId == CurrentTenantId);
            b.HasIndex(p => new { p.TenantId, p.AssetId });
            b.HasIndex(p => p.CreatedAt);
            b.Property(p => p.RiskProbability).HasPrecision(5, 4);
            b.Property(p => p.RiskLevel).HasMaxLength(50);
        });

        modelBuilder.Entity<AssetHub.Domain.Assets.AssetAttachment>(b =>
        {
            b.HasKey(a => a.Id);
            b.HasQueryFilter(a => a.TenantId == CurrentTenantId);
            b.HasIndex(a => new { a.TenantId, a.AssetId });
        });

        modelBuilder.Entity<AssetHub.Domain.Assets.AssetConditionHistory>(b =>
        {
            b.HasKey(h => h.Id);
            b.HasQueryFilter(h => h.TenantId == CurrentTenantId);
            b.HasIndex(h => new { h.TenantId, h.AssetId });
        });

        modelBuilder.Entity<AssetHub.Domain.Assets.AssetHierarchy>(b =>
        {
            b.HasKey(h => new { h.AncestorId, h.DescendantId });
            b.HasIndex(h => new { h.DescendantId, h.Depth });
            
            b.HasOne(h => h.Ancestor).WithMany().HasForeignKey(h => h.AncestorId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(h => h.Descendant).WithMany().HasForeignKey(h => h.DescendantId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AssetHub.Domain.Assets.AssetAttributeValue>(b =>
        {
            b.HasKey(v => v.Id);
            b.HasQueryFilter(v => v.TenantId == CurrentTenantId);
            b.HasIndex(v => new { v.TenantId, v.AssetId, v.AttributeKey });
            b.HasIndex(v => v.ValueType);
        });

        modelBuilder.Entity<AssetHub.Domain.Incidents.Incident>(b =>
        {
            b.HasKey(i => i.Id);
            b.HasQueryFilter(i => i.TenantId == CurrentTenantId && !i.IsDeleted);
            b.HasIndex(i => new { i.TenantId, i.State });
            b.HasIndex(i => new { i.TenantId, i.AssetId });

            b.HasOne(i => i.Asset).WithMany(a => a.Incidents).HasForeignKey(i => i.AssetId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(i => i.WorkflowTemplate).WithMany().HasForeignKey(i => i.WorkflowTemplateId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<CatalogItem>().WithMany().HasForeignKey(i => i.TypeId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<CatalogItem>().WithMany().HasForeignKey(i => i.PriorityId).OnDelete(DeleteBehavior.Restrict);

            b.HasMany(i => i.MaintenanceOrders).WithOne(m => m.Incident).HasForeignKey(m => m.IncidentId).OnDelete(DeleteBehavior.Restrict);
            b.HasMany(i => i.WorkTasks).WithOne(t => t.Incident).HasForeignKey(t => t.IncidentId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AssetHub.Domain.Incidents.IncidentAttachment>(b =>
        {
            b.HasKey(ia => ia.Id);
            b.HasQueryFilter(ia => ia.TenantId == CurrentTenantId);
            b.HasIndex(ia => new { ia.TenantId, ia.IncidentId });
        });

        modelBuilder.Entity<AssetHub.Domain.Incidents.IncidentLifecycleEvent>(b =>
        {
            b.HasKey(e => e.Id);
            b.HasIndex(e => new { e.IncidentId });
        });

        modelBuilder.Entity<AssetHub.Domain.Maintenance.PreventivePlan>(b =>
        {
            b.HasKey(p => p.Id);
            b.HasQueryFilter(p => p.TenantId == CurrentTenantId && !p.IsDeleted);
            b.HasIndex(p => new { p.TenantId, p.NextRunAt });

            b.HasOne(p => p.Asset).WithMany(a => a.PreventivePlans).HasForeignKey(p => p.AssetId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(p => p.AssetTemplate).WithMany().HasForeignKey(p => p.AssetTemplateId).OnDelete(DeleteBehavior.Restrict);

            b.HasOne<AssetHub.Domain.Staff.Employee>().WithMany().HasForeignKey(p => p.DefaultAssignedEmployeeId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<AssetHub.Domain.Staff.Team>().WithMany().HasForeignKey(p => p.DefaultAssignedTeamId).OnDelete(DeleteBehavior.Restrict);

            b.HasMany(p => p.MaintenanceOrders).WithOne(m => m.PreventivePlan).HasForeignKey(m => m.PreventivePlanId).OnDelete(DeleteBehavior.Restrict);
            b.HasMany(p => p.WorkTasks).WithOne(t => t.PreventivePlan).HasForeignKey(t => t.PreventivePlanId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AssetHub.Domain.Maintenance.PreventivePlanExecutionLog>(b =>
        {
            b.HasKey(e => e.Id);
            b.HasQueryFilter(e => e.TenantId == CurrentTenantId);
            b.HasIndex(e => new { e.TenantId, e.PreventivePlanId, e.Occurrence });
            b.HasIndex(e => new { e.TenantId, e.PreventivePlanId, e.AssetId, e.Occurrence }).IsUnique();
            b.HasIndex(e => new { e.TenantId, e.AssetId });

            b.HasOne(e => e.PreventivePlan).WithMany().HasForeignKey(e => e.PreventivePlanId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AssetHub.Domain.Notifications.Notification>(b =>
        {
            b.HasKey(n => n.Id);
            b.HasQueryFilter(n => n.TenantId == CurrentTenantId);
            b.HasIndex(n => new { n.TenantId, n.UserId, n.IsRead });
            b.HasIndex(n => new { n.TenantId, n.CreatedAt });
        });

        modelBuilder.Entity<AssetHub.Domain.Maintenance.MaintenanceOrder>(b =>
        {
            b.HasKey(m => m.Id);
            b.HasQueryFilter(m => m.TenantId == CurrentTenantId && !m.IsDeleted);
            b.HasIndex(m => new { m.TenantId, m.State });
            b.HasIndex(m => new { m.TenantId, m.AssetId });
            b.HasOne(m => m.AssignedEmployee).WithMany().HasForeignKey(m => m.AssignedEmployeeId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AssetHub.Domain.Maintenance.MaintenancePart>(b =>
        {
            b.HasKey(mp => mp.Id);
            b.HasQueryFilter(mp => mp.TenantId == CurrentTenantId);
            b.HasIndex(mp => new { mp.TenantId, mp.MaintenanceOrderId });
            
            b.Property(mp => mp.Quantity).HasPrecision(18, 4);
            b.Property(mp => mp.UnitCost).HasPrecision(18, 4);
            
            b.HasOne<AssetHub.Domain.Inventory.Warehouse>()
             .WithMany()
             .HasForeignKey(mp => mp.WarehouseId)
             .OnDelete(DeleteBehavior.Restrict);
             
            b.HasOne<AssetHub.Domain.Inventory.InventoryTransaction>()
             .WithMany()
             .HasForeignKey(mp => mp.InventoryTransactionId)
             .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AssetHub.Domain.Analytics.CostEntry>(b =>
        {
            b.HasKey(c => c.Id);
            b.HasQueryFilter(c => c.TenantId == CurrentTenantId && !c.IsDeleted);
            b.HasIndex(c => new { c.TenantId, c.AssetId, c.OccurredAt });
            b.HasIndex(c => new { c.TenantId, c.WorkOrderId });
            b.HasIndex(c => new { c.TenantId, c.IncidentId });

            b.Property(c => c.Amount).HasPrecision(18, 4);
            b.Property(c => c.Currency).HasMaxLength(3);
            b.Property(c => c.CostType).HasMaxLength(50);

            b.HasOne(c => c.Asset).WithMany().HasForeignKey(c => c.AssetId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(c => c.Incident).WithMany().HasForeignKey(c => c.IncidentId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(c => c.WorkOrder).WithMany().HasForeignKey(c => c.WorkOrderId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AssetHub.Domain.Inventory.TenantInventorySettings>(b =>
        {
            b.HasKey(s => s.Id);
            b.HasQueryFilter(s => s.TenantId == CurrentTenantId);
            b.HasIndex(s => s.TenantId).IsUnique();
        });

        modelBuilder.Entity<AssetHub.Domain.Inventory.Warehouse>(b =>
        {
            b.HasKey(w => w.Id);
            b.HasQueryFilter(w => w.TenantId == CurrentTenantId && !w.IsDeleted);
            b.HasIndex(w => new { w.Code, w.TenantId }).IsUnique();
        });

        modelBuilder.Entity<AssetHub.Domain.Inventory.StockBalance>(b =>
        {
            b.HasKey(s => s.Id);
            b.HasQueryFilter(s => s.TenantId == CurrentTenantId);
            b.HasIndex(s => new { s.TenantId, s.WarehouseId, s.CatalogItemId }).IsUnique();
            
            b.Property(s => s.QuantityOnHand).HasPrecision(18, 4);
            b.Property(s => s.AverageUnitCost).HasPrecision(18, 4);
            b.Property(s => s.RowVersion).IsRowVersion();

            b.HasOne(s => s.Warehouse).WithMany().HasForeignKey(s => s.WarehouseId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(s => s.CatalogItem).WithMany().HasForeignKey(s => s.CatalogItemId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AssetHub.Domain.Inventory.InventoryTransaction>(b =>
        {
            b.HasKey(t => t.Id);
            b.HasQueryFilter(t => t.TenantId == CurrentTenantId);
            
            // Idempotency check per tenant
            b.HasIndex(t => new { t.TenantId, t.IdempotencyKey }).IsUnique();
            
            b.Property(t => t.Quantity).HasPrecision(18, 4);
            b.Property(t => t.UnitCost).HasPrecision(18, 4);

            b.HasOne(t => t.Warehouse).WithMany().HasForeignKey(t => t.WarehouseId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(t => t.CatalogItem).WithMany().HasForeignKey(t => t.CatalogItemId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<AssetHub.Domain.Maintenance.MaintenanceOrder>().WithMany().HasForeignKey(t => t.MaintenanceOrderId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<AssetHub.Domain.Inventory.InventoryTransaction>().WithMany().HasForeignKey(t => t.ReversalOfId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AssetHub.Domain.Staff.Employee>(b =>
        {
            b.HasKey(e => e.Id);
            b.HasQueryFilter(e => e.TenantId == CurrentTenantId && !e.IsDeleted);
            b.HasIndex(e => new { e.TenantId, e.UserId }).IsUnique().HasFilter("\"UserId\" IS NOT NULL");
        });

        modelBuilder.Entity<AssetHub.Domain.Staff.EmployeeAvailability>(b =>
        {
            b.HasKey(ea => ea.Id);
            b.HasQueryFilter(ea => ea.TenantId == CurrentTenantId);
            b.HasIndex(ea => new { ea.TenantId, ea.EmployeeId });
        });

        modelBuilder.Entity<AssetHub.Domain.Staff.Team>(b =>
        {
            b.HasKey(t => t.Id);
            b.HasQueryFilter(t => t.TenantId == CurrentTenantId && !t.IsDeleted);
        });

        modelBuilder.Entity<AssetHub.Domain.Staff.TeamMember>(b =>
        {
            b.HasKey(tm => tm.Id);
            b.HasQueryFilter(tm => tm.TenantId == CurrentTenantId);
            b.HasIndex(tm => new { tm.TenantId, tm.TeamId });
            b.HasIndex(tm => new { tm.TenantId, tm.EmployeeId });
        });

        modelBuilder.Entity<AssetHub.Domain.Tasks.WorkTask>(b =>
        {
            b.HasKey(t => t.Id);
            b.HasQueryFilter(t => t.TenantId == CurrentTenantId && !t.IsDeleted);
            b.HasIndex(t => new { t.TenantId, t.State, t.IsDeleted });
            b.HasIndex(t => new { t.TenantId, t.IsDeleted });
            b.HasMany(t => t.TaskComments).WithOne(c => c.WorkTask).HasForeignKey(c => c.WorkTaskId).OnDelete(DeleteBehavior.Cascade);
            b.HasMany(t => t.StatusHistory).WithOne(h => h.WorkTask).HasForeignKey(h => h.WorkTaskId).OnDelete(DeleteBehavior.Cascade);
            b.HasIndex(t => new { t.TenantId, t.AssetId });
            b.HasIndex(t => new { t.TenantId, t.IncidentId });
            b.HasIndex(t => new { t.TenantId, t.MaintenanceOrderId });
            b.HasIndex(t => new { t.TenantId, t.PreventivePlanId });
            b.HasIndex(t => new { t.TenantId, t.TaskRecurrenceId });
            b.HasIndex(t => new { t.TenantId, t.AssignedEmployeeId });
            b.HasIndex(t => new { t.TenantId, t.AssignedTeamId });
            b.HasIndex(t => new { t.TenantId, t.DueAt });

            b.HasOne(t => t.Asset).WithMany(a => a.WorkTasks).HasForeignKey(t => t.AssetId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(t => t.Incident).WithMany(i => i.WorkTasks).HasForeignKey(t => t.IncidentId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(t => t.MaintenanceOrder).WithMany(m => m.WorkTasks).HasForeignKey(t => t.MaintenanceOrderId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(t => t.TaskTypeCatalogItem).WithMany().HasForeignKey(t => t.TaskTypeCatalogItemId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(t => t.PriorityCatalogItem).WithMany().HasForeignKey(t => t.PriorityCatalogItemId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(t => t.PreventivePlan).WithMany(p => p.WorkTasks).HasForeignKey(t => t.PreventivePlanId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(t => t.TaskRecurrence).WithMany().HasForeignKey(t => t.TaskRecurrenceId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(t => t.AssignedEmployee).WithMany().HasForeignKey(t => t.AssignedEmployeeId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(t => t.AssignedTeam).WithMany().HasForeignKey(t => t.AssignedTeamId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AssetHub.Domain.Tasks.TaskRecurrence>(b =>
        {
            b.HasKey(tr => tr.Id);
            b.HasQueryFilter(tr => tr.TenantId == CurrentTenantId);
            b.HasIndex(tr => new { tr.TenantId, tr.IsActive, tr.NextRunAt });
        });

        modelBuilder.Entity<AssetHub.Domain.Tasks.TaskStatusHistory>(b =>
        {
            b.HasKey(h => h.Id);
            b.HasQueryFilter(h => h.TenantId == CurrentTenantId);
            b.HasIndex(h => new { h.TenantId, h.WorkTaskId });
        });

        modelBuilder.Entity<AssetHub.Domain.Tasks.TaskEvidence>(b =>
        {
            b.HasKey(e => e.Id);
            b.HasQueryFilter(e => e.TenantId == CurrentTenantId);
            b.HasIndex(e => new { e.TenantId, e.WorkTaskId });
        });

        modelBuilder.Entity<AssetHub.Domain.Tasks.TaskComment>(b =>
        {
            b.HasKey(c => c.Id);
            b.HasQueryFilter(c => c.TenantId == CurrentTenantId);
            b.HasIndex(c => new { c.TenantId, c.WorkTaskId });
        });

        base.OnModelCreating(modelBuilder);
    }
}
