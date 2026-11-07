// incidents.index.tsx — List of incidents
import { useLiveQuery } from 'dexie-react-hooks';
import { FileText } from 'lucide-react';
import { db, IncidentRepository } from '@asset-hub/core-offline';
import { useState, useEffect, useMemo } from 'react';
import { IncidentDetail } from '../features/incidents/IncidentDetail';
import { DynamicTemplateForm } from '../shared/components/DynamicTemplateForm';
import { SearchableSelect } from '../shared/components/SearchableSelect';

interface IncidentsPageProps {
  tenantId?: string;
  employeeId?: string;
  userId?: string;
  teamIds?: string[];
  onNavigateOrder?: (orderId: string) => void;
  onNavigateTask?: (taskId: string) => void;
}

export function IncidentsPage({
  tenantId,
  employeeId,
  userId,
  teamIds,
  onNavigateOrder,
  onNavigateTask,
}: IncidentsPageProps) {
  const incidents = useLiveQuery(async () => {
    if (!tenantId) return db.incidents.toArray();
    const repo = new IncidentRepository(db);
    return repo.findForActor({ tenantId, employeeId, userId, teamIds });
  }, [tenantId, employeeId, userId, JSON.stringify(teamIds)]);
  const [showNew, setShowNew] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (selectedId) {
    return (
      <IncidentDetail
        incidentId={selectedId}
        onClose={() => setSelectedId(null)}
        onNavigateOrder={onNavigateOrder}
        onNavigateTask={onNavigateTask}
      />
    );
  }

  if (showNew) {
    return <NewIncidentForm onDone={() => setShowNew(false)} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Incidencias</h2>
        <button
          onClick={() => setShowNew(true)}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
        >
          Nueva
        </button>
      </div>

      {(!incidents || incidents.length === 0) && (
        <p className="text-muted-foreground">No hay incidencias registradas</p>
      )}

      <ul className="space-y-2">
        {incidents?.map((inc) => (
          <li key={inc.id} className="rounded-lg border p-3 cursor-pointer" onClick={() => setSelectedId(inc.id)}>
            <div className="flex items-center justify-between">
              <span className="font-medium">{inc.title}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${
                inc.syncState === 'synced' ? 'bg-green-500/10 text-green-600' :
                inc.syncState === 'pending' ? 'bg-amber-500/10 text-amber-600' :
                'bg-red-500/10 text-red-600'
              }`}>
                {inc.syncState}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{inc.description}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {new Date(inc.createdAtLocalIso).toLocaleString()}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NewIncidentForm({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [workflowTemplateId, setWorkflowTemplateId] = useState('');
  const [formProperties, setFormProperties] = useState<Record<string, any>>({});
  const [extraPhotoIds, setExtraPhotoIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const incidentTemplates = useLiveQuery(
    async () => {
      const all = await db.workflow_templates.toArray();
      return all.filter((t) => !t.entityType || t.entityType === 'incident' || t.entityType === 'incidents');
    },
    [],
  ) ?? [];

  useEffect(() => {
    if (incidentTemplates.length > 0 && !workflowTemplateId) {
      setWorkflowTemplateId(incidentTemplates[0].id);
    }
  }, [incidentTemplates, workflowTemplateId]);

  const selectedTemplate = useMemo(() => {
    return incidentTemplates.find((t) => t.id === workflowTemplateId) || null;
  }, [incidentTemplates, workflowTemplateId]);

  const handleFormFieldChange = (key: string, value: any) => {
    setFormProperties((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const { reportIncident } = await import('../commands/report-incident');
      await reportIncident(db, {
        title: title.trim(),
        description: description.trim(),
        workflowTemplateId: workflowTemplateId || undefined,
        propertiesJson: JSON.stringify(formProperties),
        photoIds: extraPhotoIds,
        tenantId: '',
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al reportar incidencia');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Nueva incidencia</h2>
        <button type="button" onClick={onDone} className="text-sm text-muted-foreground">
          Cancelar
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      {incidentTemplates.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Plantilla de Incidencia</label>
          <SearchableSelect
            value={workflowTemplateId}
            onChange={(next) => {
              setWorkflowTemplateId(next);
              setFormProperties({});
              setExtraPhotoIds([]);
            }}
            options={incidentTemplates.map((tpl) => ({ value: tpl.id, label: tpl.name }))}
            placeholder="(Sin plantilla específica)"
            searchPlaceholder="Buscar plantilla..."
            icon={<FileText className="h-3.5 w-3.5" />}
          />
        </div>
      )}

      {/* Dynamic Fields of the Template */}
      <DynamicTemplateForm
        template={selectedTemplate}
        values={formProperties}
        onChange={handleFormFieldChange}
        onPhotosChange={(ids) => setExtraPhotoIds((prev) => [...prev, ...ids])}
        disabled={isSubmitting}
      />

      <div className="space-y-2">
        <label className="text-sm font-medium">Título</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="Descripción breve del problema"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Descripción</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="Detalles adicionales..."
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting || !title.trim()}
        className="flex h-10 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {isSubmitting ? 'Reportando…' : 'Reportar incidencia'}
      </button>
    </form>
  );
}
