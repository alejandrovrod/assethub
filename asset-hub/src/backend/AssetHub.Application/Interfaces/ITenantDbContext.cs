using System.Threading;
using System.Threading.Tasks;
using AssetHub.Domain.AssetTemplates;
using AssetHub.Domain.Catalogs;
using AssetHub.Domain.EntityTypes;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Interfaces;

public interface ITenantDbContext
{
    DbSet<Catalog> Catalogs { get; }
    DbSet<CatalogItem> CatalogItems { get; }
    DbSet<CatalogItemTranslation> CatalogItemTranslations { get; }
    DbSet<BusinessEntityType> BusinessEntityTypes { get; }
    DbSet<AssetTemplate> AssetTemplates { get; }
    DbSet<AssetHub.Domain.IncidentTemplates.IncidentTemplate> IncidentTemplates { get; }

    DbSet<AssetHub.Domain.Assets.Asset> Assets { get; }
    DbSet<AssetHub.Domain.Assets.AssetConditionHistory> AssetConditionHistories { get; }
    DbSet<AssetHub.Domain.Assets.AssetHierarchy> AssetHierarchies { get; }
    DbSet<AssetHub.Domain.Assets.AssetAttachment> AssetAttachments { get; }
    DbSet<AssetHub.Domain.Assets.AssetLifecycleEvent> AssetLifecycleEvents { get; }
    DbSet<AssetHub.Domain.Assets.AssetAttributeValue> AssetAttributeValues { get; }
    
    DbSet<AssetHub.Domain.Incidents.Incident> Incidents { get; }
    DbSet<AssetHub.Domain.Incidents.IncidentAttachment> IncidentAttachments { get; }
    DbSet<AssetHub.Domain.Incidents.IncidentLifecycleEvent> IncidentLifecycleEvents { get; }
    DbSet<AssetHub.Domain.Incidents.PreventivePlan> PreventivePlans { get; }
    
    DbSet<AssetHub.Domain.Maintenance.MaintenanceOrder> MaintenanceOrders { get; }
    DbSet<AssetHub.Domain.Maintenance.MaintenancePart> MaintenanceParts { get; }
    
    DbSet<AssetHub.Domain.Staff.Employee> Employees { get; }
    DbSet<AssetHub.Domain.Staff.EmployeeAvailability> EmployeeAvailabilities { get; }
    DbSet<AssetHub.Domain.Staff.Team> Teams { get; }
    DbSet<AssetHub.Domain.Staff.TeamMember> TeamMembers { get; }
    
    DbSet<AssetHub.Domain.Tasks.WorkTask> WorkTasks { get; }
    DbSet<AssetHub.Domain.Tasks.TaskRecurrence> TaskRecurrences { get; }
    DbSet<AssetHub.Domain.Tasks.TaskStatusHistory> TaskStatusHistories { get; }
    DbSet<AssetHub.Domain.Tasks.TaskEvidence> TaskEvidences { get; }
    DbSet<AssetHub.Domain.Tasks.TaskComment> TaskComments { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken);
}
