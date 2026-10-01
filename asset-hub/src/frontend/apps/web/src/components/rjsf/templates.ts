import { CustomObjectFieldTemplate } from './CustomObjectFieldTemplate';

/** Shared, referentially-stable RJSF template registry overrides.
 *  Registered on every Form that renders dynamic (asset/incident) schemas so
 *  tabs/sections render when present and default behavior is kept otherwise. */
export const rjsfTemplates = {
  ObjectFieldTemplate: CustomObjectFieldTemplate,
};
