// ChecklistForm.tsx — RJSF-based checklist form with draft autosave and error scroll
import { useState, useEffect, useRef } from 'react';
import Form from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import type { RJSFValidationError } from '@rjsf/utils';
import { saveChecklist, saveChecklistDraft } from '../../../commands/save-checklist';
import { db } from '@asset-hub/core-offline';

interface ChecklistFormProps {
  taskId: string;
  schemaJson: string;
  uiSchemaJson?: string;
  draftJson?: string;
  responseJson?: string;
  isReadOnly?: boolean;
  onSave?: () => void;
}

export function ChecklistForm({
  taskId,
  schemaJson,
  uiSchemaJson,
  draftJson,
  responseJson,
  isReadOnly = false,
  onSave,
}: ChecklistFormProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>(() => {
    try {
      if (draftJson) return JSON.parse(draftJson);
      if (responseJson) return JSON.parse(responseJson);
    } catch {
      // ignore JSON parse error
    }
    return {};
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const formContainerRef = useRef<HTMLDivElement>(null);
  const autosaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const schema = JSON.parse(schemaJson);
  const uiSchema = uiSchemaJson ? JSON.parse(uiSchemaJson) : {};

  // Debounced autosave (2 s) for drafts
  useEffect(() => {
    if (isReadOnly) return;
    if (Object.keys(formData).length === 0) return;

    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }

    autosaveTimeoutRef.current = setTimeout(async () => {
      try {
        await saveChecklistDraft(db, taskId, JSON.stringify(formData));
        setSaveStatus('Borrador guardado localmente');
      } catch (err) {
        console.error('Failed to autosave checklist draft:', err);
      }
    }, 2000);

    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, [formData, taskId, isReadOnly]);

  const handleSubmit = async ({ formData: data }: { formData?: unknown }) => {
    setIsSaving(true);
    setError(null);
    try {
      await saveChecklist(db, taskId, JSON.stringify(data ?? {}));
      setSaveStatus('Checklist guardado y encolado para sincronización');
      if (onSave) onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar checklist');
    } finally {
      setIsSaving(false);
    }
  };

  const onError = (errors: RJSFValidationError[]) => {
    if (errors.length > 0 && formContainerRef.current) {
      const firstErrorElement = formContainerRef.current.querySelector(
        '.field-error, .has-error, [aria-invalid="true"]',
      );
      if (firstErrorElement) {
        firstErrorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  return (
    <div ref={formContainerRef} className="space-y-4">
      {saveStatus && (
        <div className="rounded-md bg-muted px-3 py-1.5 text-xs text-muted-foreground">
          {saveStatus}
        </div>
      )}

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Form
        schema={schema}
        uiSchema={uiSchema}
        formData={formData}
        validator={validator}
        onChange={({ formData: data }) => setFormData((data as Record<string, unknown>) ?? {})}
        onSubmit={handleSubmit}
        onError={onError}
        disabled={isReadOnly || isSaving}
        liveValidate
        showErrorList="bottom"
      >
        {!isReadOnly && (
          <button
            type="submit"
            disabled={isSaving}
            className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-sm active:scale-98 disabled:opacity-50"
          >
            {isSaving ? 'Guardando…' : 'Guardar y confirmar checklist'}
          </button>
        )}
      </Form>
    </div>
  );
}
