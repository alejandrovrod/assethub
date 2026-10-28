import { CustomObjectFieldTemplate } from './CustomObjectFieldTemplate';
import type { FieldErrorProps } from '@rjsf/utils';

/** Clean shadcn-styled inline field error template */
function CustomFieldErrorTemplate(props: FieldErrorProps) {
  const { errors = [] } = props;
  const filtered = errors.filter(Boolean);
  if (filtered.length === 0) return null;

  return (
    <div className="mt-1.5 space-y-1">
      {filtered.map((error, index) => (
        <p key={index} className="text-xs font-medium text-destructive">
          {error}
        </p>
      ))}
    </div>
  );
}

/** Shared, referentially-stable RJSF template registry overrides.
 *  Registered on every Form that renders dynamic (asset/incident) schemas so
 *  tabs/sections render when present and default behavior is kept otherwise. */
export const rjsfTemplates = {
  ObjectFieldTemplate: CustomObjectFieldTemplate,
  ErrorListTemplate: () => null,
  FieldErrorTemplate: CustomFieldErrorTemplate,
};
