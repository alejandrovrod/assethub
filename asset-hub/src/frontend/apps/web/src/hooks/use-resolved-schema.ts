import { useState, useEffect } from 'react';
import { catalogService } from '@/services/catalog.service';

export function useResolvedSchema(rawSchemaJson: string) {
  const [schema, setSchema] = useState<any>({});
  const [isResolving, setIsResolving] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function resolveSchema() {
      setIsResolving(true);
      let parsedSchema: any = {};
      
      try {
        parsedSchema = JSON.parse(rawSchemaJson || '{}');
      } catch (e) {
        if (isMounted) {
          setSchema({});
          setIsResolving(false);
        }
        return;
      }

      if (!parsedSchema.properties) {
        if (isMounted) {
          setSchema(parsedSchema);
          setIsResolving(false);
        }
        return;
      }

      // Deep clone to avoid mutating the original
      const resolvedSchema = JSON.parse(JSON.stringify(parsedSchema));
      
      // Extract all properties that need catalog resolution
      const catalogPromises = [];
      const keysToUpdate: { key: string, catalogCode: string }[] = [];

      for (const key of Object.keys(resolvedSchema.properties)) {
        const prop = resolvedSchema.properties[key];
        
        // Auto-fix legacy broken date types
        if (prop.type === 'date') {
          prop.type = 'string';
          prop.format = 'date';
        }

        if (prop.catalogCode) {
          keysToUpdate.push({ key, catalogCode: prop.catalogCode });
          catalogPromises.push(catalogService.getCatalogItems(prop.catalogCode));
        }
      }

      if (catalogPromises.length > 0) {
        try {
          const results = await Promise.all(catalogPromises);
          
          results.forEach((items, index) => {
            const { key } = keysToUpdate[index];
            const prop = resolvedSchema.properties[key];
            
            // Build the enum arrays using standard JSON Schema oneOf for RJSF v6
            if (items && items.length > 0) {
              delete prop.enum;
              delete prop.enumNames;
              prop.oneOf = items.map((item: any) => ({
                const: item.id,
                title: item.label || item.Label || item.code
              }));
            } else {
              delete prop.enum;
              delete prop.enumNames;
              prop.oneOf = [
                { const: '_empty_', title: '(Catálogo Vacío)' }
              ];
            }
          });
        } catch (error) {
          console.error("Error resolving catalogs for schema:", error);
        }
      }

      if (isMounted) {
        setSchema(resolvedSchema);
        setIsResolving(false);
      }
    }

    resolveSchema();

    return () => {
      isMounted = false;
    };
  }, [rawSchemaJson]);

  return { schema, isResolving };
}
