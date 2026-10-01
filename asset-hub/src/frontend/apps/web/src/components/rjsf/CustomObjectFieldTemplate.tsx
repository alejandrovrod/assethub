import { Fragment, useEffect, useRef, useState, type ReactElement } from 'react';
import type {
  FormContextType,
  ObjectFieldTemplateProps,
  RJSFSchema,
  StrictRJSFSchema,
} from '@rjsf/utils';
import { buttonId, canExpand, descriptionId, getTemplate, getUiOptions, titleId } from '@rjsf/utils';
// Deep import of RJSF's own template: guarantees a byte-identical fallback for
// schemas that don't use tabs/sections (zero-regression requirement).
import DefaultObjectFieldTemplate from '@rjsf/core/lib/components/templates/ObjectFieldTemplate.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { AlertCircle } from 'lucide-react';

/** Fields without a `tab` land here, per spec. */
const DEFAULT_TAB = 'General';

/** Explicit grid because the tabbed root container is a `div`, not a `fieldset`
 *  (index.css grid rules target `fieldset` only). */
const SECTION_GRID_CLASS = 'rjsf-section-grid';

interface TabProperty {
  name: string;
  content: ReactElement;
  hidden: boolean;
  section?: string;
}

function readLabel(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function propertyErrorCount(errorSchema: unknown, name: string): number {
  if (!errorSchema || typeof errorSchema !== 'object') return 0;
  const entry = (errorSchema as Record<string, unknown>)[name];
  if (!entry || typeof entry !== 'object') return 0;
  const errors = (entry as { __errors?: unknown }).__errors;
  return Array.isArray(errors) ? errors.length : 0;
}

/**
 * ObjectFieldTemplate with hybrid tab + section-divider organization for dynamic
 * RJSF forms (20-80+ fields).
 *
 * - Schemas without `tab`/`section`/`x-form-tabs` delegate to RJSF's default
 *   template: rendering is identical to before this feature existed.
 * - Tabs render only when there are 2+ tabs; inactive tab content unmounts so
 *   hidden inputs stay out of native HTML5 validation (no noValidate needed).
 * - `formData` lives in RJSF's React state, so unmounting never loses data.
 * - Error badges come from the object-level `errorSchema`, which RJSF only
 *   populates after submit (unless the form opts into liveValidate).
 */
export function CustomObjectFieldTemplate<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>(props: ObjectFieldTemplateProps<T, S, F>) {
  const {
    className,
    description,
    disabled,
    formData,
    fieldPathId,
    onAddProperty,
    optionalDataControl,
    properties,
    readonly,
    registry,
    required,
    schema,
    title,
    uiSchema,
    errorSchema,
  } = props;

  const rawSchema = schema as unknown as Record<string, unknown>;
  const propertySchemas = (rawSchema.properties ?? {}) as Record<
    string,
    Record<string, unknown> | undefined
  >;

  const xTabsRaw = rawSchema['x-form-tabs'];
  const xTabs = Array.isArray(xTabsRaw)
    ? xTabsRaw.filter((t): t is string => !!readLabel(t)).map((t) => readLabel(t) as string)
    : [];
  const xSectionsRaw = rawSchema['x-form-sections'];
  const hasSectionsMeta =
    !!xSectionsRaw && typeof xSectionsRaw === 'object' && Object.keys(xSectionsRaw as object).length > 0;

  const uiOptions = getUiOptions<T, S, F>(uiSchema);
  const disableTabs = uiOptions?.disableTabs === true;

  const isOrganized =
    properties.some((property) => {
      const propertySchema = propertySchemas[property.name];
      return !!(readLabel(propertySchema?.tab) || readLabel(propertySchema?.section));
    }) ||
    xTabs.length > 0 ||
    hasSectionsMeta;

  // Tab order: x-form-tabs metadata first, then first appearance in properties
  // (properties without `tab` default to General, per spec).
  const tabs: string[] = [];
  const pushTab = (tab: string) => {
    if (!tabs.includes(tab)) tabs.push(tab);
  };
  xTabs.forEach(pushTab);
  properties.forEach((property) =>
    pushTab(readLabel(propertySchemas[property.name]?.tab) ?? DEFAULT_TAB)
  );

  const groupedByTab = new Map<string, TabProperty[]>();
  properties.forEach((property) => {
    const propertySchema = propertySchemas[property.name];
    const tab = readLabel(propertySchema?.tab) ?? DEFAULT_TAB;
    const group = groupedByTab.get(tab) ?? [];
    group.push({
      name: property.name,
      content: property.content,
      hidden: property.hidden,
      section: readLabel(propertySchema?.section),
    });
    groupedByTab.set(tab, group);
  });

  const countsByTab: Record<string, number> = {};
  tabs.forEach((tab) => {
    countsByTab[tab] = (groupedByTab.get(tab) ?? []).reduce(
      (total, property) => total + propertyErrorCount(errorSchema, property.name),
      0
    );
  });

  // ---- Hooks (unconditional: schema metadata can change without remounting) ----
  const [activeTabState, setActiveTab] = useState<string | null>(null);
  const errorKey = JSON.stringify(errorSchema ?? {});
  const lastErrorKeyRef = useRef(errorKey);

  useEffect(() => {
    if (lastErrorKeyRef.current === errorKey) return;
    lastErrorKeyRef.current = errorKey;
    if (tabs.length < 2) return;
    if (tabs.every((tab) => countsByTab[tab] === 0)) return;
    const active =
      activeTabState !== null && tabs.includes(activeTabState) ? activeTabState : tabs[0];
    if (countsByTab[active] > 0) return; // the visible tab already shows its errors
    const firstErrored = tabs.find((tab) => countsByTab[tab] > 0);
    if (firstErrored) setActiveTab(firstErrored);
  }, [errorKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOrganized || tabs.length === 0) {
    return <DefaultObjectFieldTemplate<T, S, F> {...props} />;
  }

  // The active tab may have disappeared (schema edited live): fall back safely.
  if (activeTabState !== null && !tabs.includes(activeTabState)) {
    setActiveTab(null); // render-phase adjustment (React-supported)
  }
  const activeTab = activeTabState !== null && tabs.includes(activeTabState) ? activeTabState : tabs[0];

  const options = getUiOptions<T, S, F>(uiSchema);
  const TitleFieldTemplate = getTemplate<'TitleFieldTemplate', T, S, F>(
    'TitleFieldTemplate',
    registry,
    options
  );
  const DescriptionFieldTemplate = getTemplate<'DescriptionFieldTemplate', T, S, F>(
    'DescriptionFieldTemplate',
    registry,
    options
  );
  const {
    ButtonTemplates: { AddButton },
  } = registry.templates;

  const showOptionalDataControlInTitle = !readonly && !disabled;

  const renderTabBody = (tab: string) => {
    const items = groupedByTab.get(tab) ?? [];
    const sectionless = items.filter((item) => !item.section);
    const sectionOrder: string[] = [];
    items.forEach((item) => {
      if (item.section && !sectionOrder.includes(item.section)) sectionOrder.push(item.section);
    });

    return (
      <div className="flex flex-col gap-6">
        {sectionless.length > 0 && (
          <div className={SECTION_GRID_CLASS}>
            {sectionless.map((item) => (
              <Fragment key={item.name}>{item.content}</Fragment>
            ))}
          </div>
        )}
        {sectionOrder.map((section) => (
          <section key={section} aria-label={section}>
            <h3 className="text-base font-semibold">{section}</h3>
            <Separator className="my-3" />
            <div className={SECTION_GRID_CLASS}>
              {items
                .filter((item) => item.section === section)
                .map((item) => (
                  <Fragment key={item.name}>{item.content}</Fragment>
                ))}
            </div>
          </section>
        ))}
      </div>
    );
  };

  return (
    <div className={className} id={fieldPathId.$id}>
      {title && (
        <TitleFieldTemplate
          id={titleId(fieldPathId)}
          title={title}
          required={required}
          schema={schema}
          uiSchema={uiSchema}
          registry={registry}
          optionalDataControl={showOptionalDataControlInTitle ? optionalDataControl : undefined}
        />
      )}
      {description && (
        <DescriptionFieldTemplate
          id={descriptionId(fieldPathId)}
          description={description}
          schema={schema}
          uiSchema={uiSchema}
          registry={registry}
        />
      )}
      {!showOptionalDataControlInTitle ? optionalDataControl : undefined}

      {!disableTabs && (tabs.length >= 2 || (tabs.length === 1 && tabs[0] !== DEFAULT_TAB)) ? (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-auto flex-wrap justify-start gap-1 bg-muted/60 p-1">
            {tabs.map((tab) => (
              <TabsTrigger key={tab} value={tab} className="h-auto px-3 py-1.5">
                {tab}
                {countsByTab[tab] > 0 && (
                  <Badge variant="destructive" className="ml-1.5 gap-0.5 px-1.5 py-0 text-[10px]">
                    <AlertCircle className="!size-3" />
                    {countsByTab[tab]}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((tab) => (
            <TabsContent key={tab} value={tab} className="mt-4 outline-none">
              {renderTabBody(tab)}
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <div className="flex flex-col gap-6">
          {tabs.map((tab) => (
            <Fragment key={tab}>
              {!disableTabs && tabs.length > 1 && (
                <h4 className="text-sm font-semibold text-muted-foreground">{tab}</h4>
              )}
              {renderTabBody(tab)}
            </Fragment>
          ))}
        </div>
      )}

      {canExpand<T, S, F>(schema, uiSchema, formData) && (
        <AddButton
          id={buttonId(fieldPathId, 'add')}
          className="rjsf-object-property-expand"
          onClick={onAddProperty}
          disabled={disabled || readonly}
          uiSchema={uiSchema}
          registry={registry}
        />
      )}
    </div>
  );
}
