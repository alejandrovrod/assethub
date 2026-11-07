using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Incidents;
using AssetHub.Domain.Maintenance;
using AssetHub.Domain.Tasks;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Common.Workflow;

/// <summary>
/// Resolves "my work" for the authenticated user.
///
/// Two sources can declare the executor of a work item, and either one grants the work:
///
///   1. <c>PropertiesJson</c> — the dynamic form template (<c>asignar_a</c> / <c>asignado_a</c>).
///   2. <c>AssignedEmployeeId</c> / <c>AssignedTeamId</c> — the relational columns, written by
///      the backoffice assignment flow, preventive plans and integrations.
///
/// In tenant data both sources agree whenever both are present, so the filter uses an OR and
/// never hides work that either source assigns. Follow-up keys (<c>reportar_a</c>,
/// <c>reportado_a</c>, <c>recibe_a</c>) are never an assignment: a technician who only watches
/// a case must not receive it in the field app.
///
/// SQL Server cannot evaluate <c>PropertiesJson</c> predicates reliably (the column is
/// <c>nvarchar(max)</c> and some rows hold malformed JSON, which makes <c>JSON_VALUE</c>
/// throw), so the query is split in two:
///
///   * a coarse, SQL-translatable prefilter (<c>LIKE '%{employeeId}%'</c>) that narrows the
///     candidate set to rows that mention the employee at all, and
///   * an exact, in-memory check with <see cref="WorkflowProperties.MatchesExecutor"/> that
///     drops the rows where the employee only appears as a follower.
///
/// The prefilter is intentionally over-inclusive; the exact check is what decides.
/// </summary>
public static class AssignedWork
{
    /// <summary>
    /// Employee record linked to the authenticated user. <c>null</c> means the user has no
    /// staff record in the active tenant, and therefore no assigned work.
    /// </summary>
    public static async Task<Guid?> ResolveEmployeeIdAsync(
        ITenantDbContext db,
        ICurrentUser currentUser,
        CancellationToken cancellationToken)
    {
        if (currentUser.Id is not { } userId)
        {
            return null;
        }

        return await db.Employees
            .AsNoTracking()
            .Where(e => e.UserId == userId)
            .Select(e => (Guid?)e.Id)
            .FirstOrDefaultAsync(cancellationToken);
    }

    /// <summary>Team ids the employee belongs to. Field work can be assigned to a whole team.</summary>
    public static async Task<List<Guid>> ResolveTeamIdsAsync(
        ITenantDbContext db,
        Guid employeeId,
        CancellationToken cancellationToken)
    {
        return await db.TeamMembers
            .AsNoTracking()
            .Where(m => m.EmployeeId == employeeId)
            .Select(m => m.TeamId)
            .ToListAsync(cancellationToken);
    }

    /// <summary>Text marker used by the SQL prefilter. Case-insensitive: the DB collation is CI.</summary>
    public static string Marker(Guid employeeId) => employeeId.ToString("D");

    // ── Coarse SQL prefilters ────────────────────────────────────────────────────────────

    /// <summary>
    /// Incidents are never assigned through a column: they have no <c>AssignedEmployeeId</c>.
    /// The assignment is the template property, plus the fallback of a corrective order that
    /// already carries the employee — either in its own properties or in the relational column.
    /// </summary>
    public static IQueryable<Incident> WhereAssignedCandidates(
        this IQueryable<Incident> query,
        ITenantDbContext db,
        Guid employeeId)
    {
        var marker = Marker(employeeId);

        return query.Where(i =>
            (i.PropertiesJson != null && i.PropertiesJson.Contains(marker)) ||
            db.MaintenanceOrders.Any(o =>
                o.IncidentId == i.Id &&
                !o.IsDeleted &&
                (o.AssignedEmployeeId == employeeId ||
                 (o.PropertiesJson != null && o.PropertiesJson.Contains(marker)))));
    }

    /// <summary>
    /// Orders can be assigned through the relational column (backoffice, preventive plans,
    /// integrations) or through the template properties. Both sources are honored.
    /// </summary>
    public static IQueryable<MaintenanceOrder> WhereAssignedCandidates(
        this IQueryable<MaintenanceOrder> query,
        Guid employeeId)
    {
        var marker = Marker(employeeId);

        return query.Where(o =>
            o.AssignedEmployeeId == employeeId ||
            (o.PropertiesJson != null && o.PropertiesJson.Contains(marker)));
    }

    /// <summary>
    /// Tasks can be assigned to the employee (column), to one of their teams (column), or
    /// through the template properties.
    /// </summary>
    public static IQueryable<WorkTask> WhereAssignedCandidates(
        this IQueryable<WorkTask> query,
        Guid employeeId,
        IReadOnlyCollection<Guid> teamIds)
    {
        var marker = Marker(employeeId);
        var teams = teamIds.ToList();

        return query.Where(t =>
            t.AssignedEmployeeId == employeeId ||
            (t.AssignedTeamId != null && teams.Contains(t.AssignedTeamId.Value)) ||
            (t.PropertiesJson != null && t.PropertiesJson.Contains(marker)));
    }

    // ── Exact checks (in memory) ────────────────────────────────────────────────────────

    /// <summary>
    /// Exact incident ids for the employee, given an already-prefiltered query.
    ///
    /// An incident belongs to the technician when its properties name them as executor, or
    /// when one of its maintenance orders does (direct attention fallback).
    /// </summary>
    public static async Task<List<Guid>> ExactIncidentIdsAsync(
        ITenantDbContext db,
        IQueryable<Incident> candidates,
        Guid employeeId,
        CancellationToken cancellationToken)
    {
        var rows = await candidates
            .Select(i => new { i.Id, i.PropertiesJson })
            .ToListAsync(cancellationToken);

        if (rows.Count == 0)
        {
            return [];
        }

        var incidentIds = rows.Select(r => r.Id).ToList();
        var orderRows = await db.MaintenanceOrders
            .AsNoTracking()
            .Where(o => o.IncidentId != null && incidentIds.Contains(o.IncidentId.Value) && !o.IsDeleted)
            .Select(o => new { o.IncidentId, o.AssignedEmployeeId, o.PropertiesJson })
            .ToListAsync(cancellationToken);

        var viaOrder = new HashSet<Guid>();
        foreach (var order in orderRows)
        {
            if (order.AssignedEmployeeId == employeeId ||
                WorkflowProperties.MatchesExecutor(order.PropertiesJson, employeeId))
            {
                viaOrder.Add(order.IncidentId!.Value);
            }
        }

        return rows
            .Where(r => viaOrder.Contains(r.Id) ||
                        WorkflowProperties.MatchesExecutor(r.PropertiesJson, employeeId))
            .Select(r => r.Id)
            .ToList();
    }

    public static async Task<List<Guid>> ExactOrderIdsAsync(
        IQueryable<MaintenanceOrder> candidates,
        Guid employeeId,
        CancellationToken cancellationToken)
    {
        var rows = await candidates
            .Select(o => new { o.Id, o.AssignedEmployeeId, o.PropertiesJson })
            .ToListAsync(cancellationToken);

        return rows
            .Where(r => r.AssignedEmployeeId == employeeId ||
                        WorkflowProperties.MatchesExecutor(r.PropertiesJson, employeeId))
            .Select(r => r.Id)
            .ToList();
    }

    public static async Task<List<Guid>> ExactTaskIdsAsync(
        IQueryable<WorkTask> candidates,
        Guid employeeId,
        IReadOnlyCollection<Guid> teamIds,
        CancellationToken cancellationToken)
    {
        var teams = teamIds.ToHashSet();

        var rows = await candidates
            .Select(t => new { t.Id, t.AssignedEmployeeId, t.AssignedTeamId, t.PropertiesJson })
            .ToListAsync(cancellationToken);

        return rows
            .Where(r => r.AssignedEmployeeId == employeeId ||
                        (r.AssignedTeamId is { } teamId && teams.Contains(teamId)) ||
                        WorkflowProperties.MatchesExecutor(r.PropertiesJson, employeeId))
            .Select(r => r.Id)
            .ToList();
    }
}
