import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Node,
  Edge,
  NodeChange,
  EdgeChange,
  Connection,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Settings } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';

interface LifecycleCanvasProps {
  value: string;
  onChange: (value: string) => void;
  schemaJson?: string;
}

// Input for a comma-separated list of states. Keeps a local text draft so the
// user can actually type commas; the parsed array is committed on every change
// and the draft is normalized (canonical "a, b" form) on blur.
function ChildStatesInput({ value, onChange }: { value: string[]; onChange: (states: string[]) => void }) {
  const [text, setText] = useState(value.join(', '));

  return (
    <Input
      className="h-8 text-xs"
      placeholder="Ej: Activo, Instalado_Activo"
      value={text}
      onChange={e => {
        setText(e.target.value);
        onChange(e.target.value.split(',').map(s => s.trim()).filter(Boolean));
      }}
      onBlur={() => setText(value.join(', '))}
    />
  );
}

export function LifecycleCanvas({ value, onChange, schemaJson }: LifecycleCanvasProps) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [newNodeName, setNewNodeName] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState('');
  const lastSerializedValue = useRef<string>('');

  const availableFields = useMemo(() => {
    try {
      if (!schemaJson) return [];
      const schema = JSON.parse(schemaJson);
      if (schema?.properties) {
        return Object.keys(schema.properties).map(key => ({
          key,
          title: schema.properties[key].title || key
        }));
      }
    } catch (e) {
      return [];
    }
    return [];
  }, [schemaJson]);

  // Initialize and re-hydrate from value when it changes externally
  useEffect(() => {
    if (!value || value === lastSerializedValue.current) return;
    lastSerializedValue.current = value;

    try {
      const parsed = JSON.parse(value);
      if (parsed.nodes && parsed.edges) {
        const loadedNodes = parsed.nodes.map((n: Node) => {
          const stateConfig = parsed.states?.[n.id] || parsed.States?.[n.id] || {};
          return {
            ...n,
            data: {
              ...n.data,
              stateConfig: {
                color: stateConfig.color || stateConfig.Color || '#94a3b8',
                isTerminal: stateConfig.isTerminal ?? stateConfig.IsTerminal ?? false,
                requiresFields: stateConfig.requiresFields || stateConfig.RequiresFields || [],
                allowedRoles: stateConfig.allowedRoles || stateConfig.AllowedRoles || [],
                onEnterAction: stateConfig.onEnterAction || stateConfig.OnEnterAction || '',
                associatedModule: stateConfig.associatedModule || stateConfig.AssociatedModule || '',
                childStateDependencies: stateConfig.childStateDependencies || stateConfig.ChildStateDependencies || []
              }
            },
            style: { 
              ...n.style, 
              backgroundColor: stateConfig.color || stateConfig.Color || '#ffffff',
              border: `2px solid ${stateConfig.color || stateConfig.Color || '#94a3b8'}`,
              borderRadius: '8px',
              padding: '10px',
              color: '#000',
              fontWeight: 'bold'
            }
          };
        });
        setNodes(loadedNodes);
        setEdges(parsed.edges);
      } else if (parsed.states && Array.isArray(parsed.states)) {
        // Fallback migration from old format
        const newNodes = parsed.states.map((state: string, idx: number) => ({
          id: state,
          data: { 
            label: state, 
            stateConfig: { 
              color: '#94a3b8', 
              isTerminal: false, 
              requiresFields: [], 
              allowedRoles: [], 
              onEnterAction: '',
              associatedModule: '',
              childStateDependencies: []
            } 
          },
          position: { x: 100 + idx * 150, y: 100 },
        }));
        setNodes(newNodes);
      }
    } catch (e) {
      console.error('Error parsing lifecycle JSON', e);
    }
  }, [value]);

  // Sync to parent when nodes/edges change
  const notifyChange = useCallback((newNodes: Node[], newEdges: Edge[]) => {
    const transitions: Record<string, string[]> = {};
    const states: Record<string, any> = {};

    newNodes.forEach(n => {
      transitions[n.id] = [];
      const config = n.data?.stateConfig || {};
      states[n.id] = {
        color: config.color || '#94a3b8',
        isTerminal: config.isTerminal || false,
        requiresFields: config.requiresFields || [],
        allowedRoles: config.allowedRoles || [],
        onEnterAction: config.onEnterAction || '',
        associatedModule: config.associatedModule || '',
        childStateDependencies: config.childStateDependencies || []
      };
    });

    newEdges.forEach(e => {
      if (transitions[e.source] && !transitions[e.source].includes(e.target)) {
        transitions[e.source].push(e.target);
      }
    });
    const initialState = newNodes.length > 0 ? newNodes[0].id : "";

    const jsonStr = JSON.stringify({ 
      initialState, 
      transitions,
      states,
      nodes: newNodes, 
      edges: newEdges 
    }, null, 2);

    lastSerializedValue.current = jsonStr;
    onChange(jsonStr);
  }, [onChange]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => {
        const newNodes = applyNodeChanges(changes, nds);
        notifyChange(newNodes, edges);
        return newNodes;
      });
    },
    [edges, notifyChange]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => {
        const newEdges = applyEdgeChanges(changes, eds);
        notifyChange(nodes, newEdges);
        return newEdges;
      });
    },
    [nodes, notifyChange]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => {
        const newEdges = addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed } }, eds);
        notifyChange(nodes, newEdges);
        return newEdges;
      });
    },
    [nodes, notifyChange]
  );

  const handleAddNode = () => {
    if (!newNodeName.trim()) return;
    const name = newNodeName.trim();
    if (nodes.some(n => n.id === name)) {
      alert("Ya existe un estado con ese nombre");
      return;
    }
    const newNode: Node = {
      id: name,
      data: { 
        label: name, 
        stateConfig: { 
          color: '#94a3b8', 
          isTerminal: false, 
          requiresFields: [], 
          allowedRoles: [], 
          onEnterAction: '',
          associatedModule: '',
          childStateDependencies: []
        } 
      },
      position: { x: 100 + nodes.length * 30, y: 100 + nodes.length * 30 },
      style: { 
        backgroundColor: '#ffffff',
        border: `2px solid #94a3b8`,
        borderRadius: '8px',
        padding: '10px',
        color: '#000',
        fontWeight: 'bold'
      }
    };
    const newNodes = [...nodes, newNode];
    setNodes(newNodes);
    notifyChange(newNodes, edges);
    setNewNodeName('');
  };

  const onNodeDoubleClick = (_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
    setEditingNodeId(node.id);
  };

  const updateSelectedNodeConfig = (key: string, value: any) => {
    if (!selectedNodeId) return;
    
    setNodes(prevNodes => {
      const newNodes = prevNodes.map(n => {
        if (n.id === (nodes.find(n => n.id === selectedNodeId) || {}).id) {
          const newStateConfig = { ...(n.data.stateConfig || {}), [key]: value };
          return {
            ...n,
            data: {
              ...n.data,
              stateConfig: newStateConfig
            },
            style: key === 'color' ? { ...n.style, border: `2px solid ${value}` } : n.style
          };
        }
        return n;
      });
      
      // Notify parent with the most recent nodes
      notifyChange(newNodes, edges);
      
      // Update selected node so the UI immediately reflects the change
      const updatedNode = newNodes.find(n => n.id === (nodes.find(n => n.id === selectedNodeId) || {}).id);
      if (updatedNode) setSelectedNodeId(updatedNode.id);
      
      return newNodes;
    });
  };

  const handleRenameNode = () => {
    const selectedNode = nodes.find(n => n.id === selectedNodeId);
    if (!selectedNode || !editingNodeId.trim()) return;
    const newId = editingNodeId.trim();
    const oldId = selectedNode.id;
    if (newId === oldId) return;
    
    if (nodes.some(n => n.id === newId)) {
      alert("Ya existe un estado con ese nombre");
      setEditingNodeId(oldId);
      return;
    }

    setNodes(prevNodes => {
      const newNodes = prevNodes.map(n => {
        if (n.id === oldId) {
          return {
            ...n,
            id: newId,
            data: { ...n.data, label: newId }
          };
        }
        return n;
      });

      setEdges(prevEdges => {
        const newEdges = prevEdges.map(e => {
          let updated = { ...e };
          if (e.source === oldId) updated.source = newId;
          if (e.target === oldId) updated.target = newId;
          return updated;
        });

        notifyChange(newNodes, newEdges);
        return newEdges;
      });

      const updatedNode = newNodes.find(n => n.id === newId);
      if (updatedNode) setSelectedNodeId(updatedNode.id);

      return newNodes;
    });
  };

  return (
    <div className="flex gap-4 border rounded-md p-4 h-[500px]">
      <div className="flex flex-col flex-1 gap-4">
        <div className="flex gap-2">
          <Input 
            placeholder="Nombre del nuevo estado..." 
            value={newNodeName}
            onChange={(e) => setNewNodeName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddNode()}
          />
          <Button type="button" onClick={handleAddNode} variant="secondary">
            <Plus className="h-4 w-4 mr-2" />
            Agregar Estado
          </Button>
          <Button type="button" onClick={() => {
            const val = prompt('Pegue el JSON aquí:');
            if (val) {
              try {
                JSON.parse(val);
                onChange(val);
              } catch (e) {
                alert('El JSON ingresado no es válido');
              }
            }
          }} variant="outline">
            Importar JSON
          </Button>
        </div>
        <div className="flex-1 border rounded bg-muted/20 overflow-hidden relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDoubleClick={onNodeDoubleClick}
            onPaneClick={() => setSelectedNodeId(null)}
            deleteKeyCode={['Backspace', 'Delete']}
            fitView
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>
      </div>
      
      {/* Node Properties Panel (Sheet) */}
      <Sheet open={!!selectedNodeId} onOpenChange={(open) => !open && setSelectedNodeId(null)}>
        <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-muted-foreground" />
              Configurar Estado
            </SheetTitle>
            <div className="flex items-center gap-2 mt-2">
              <Input 
                value={editingNodeId} 
                onChange={e => setEditingNodeId(e.target.value)}
                onBlur={handleRenameNode}
                onKeyDown={e => e.key === 'Enter' && handleRenameNode()}
                className="font-semibold text-lg"
              />
            </div>
            <SheetDescription>
              Configura las propiedades visuales y reglas de negocio para este estado.
            </SheetDescription>
          </SheetHeader>
          
          {selectedNodeId && (() => {
            const selectedNode = nodes.find(n => n.id === selectedNodeId);
            if (!selectedNode) return null;
            return (
            <div className="px-4 pb-6 space-y-6">
              
              {/* Apariencia */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-primary/80 uppercase tracking-wider">Apariencia</h4>
                
                <div className="flex items-center justify-between p-3 border rounded-lg bg-card">
                  <div>
                    <label className="text-sm font-medium">Color de Etiqueta</label>
                    <p className="text-xs text-muted-foreground">Color que representará al estado</p>
                  </div>
                  <Input 
                    type="color" 
                    value={(nodes.find(n => n.id === selectedNodeId) || {}).data?.stateConfig?.color || '#94a3b8'} 
                    onChange={e => updateSelectedNodeConfig('color', e.target.value)}
                    className="h-10 w-16 p-1 rounded-md cursor-pointer"
                  />
                </div>
              </div>
              
              {/* Configuración de Comportamiento */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-primary/80 uppercase tracking-wider">Comportamiento</h4>
                
                <div className="p-4 border rounded-lg bg-card space-y-4">
                  <div className="flex items-start gap-3">
                    <input 
                      type="checkbox" 
                      id="isTerminal"
                      checked={(nodes.find(n => n.id === selectedNodeId) || {}).data?.stateConfig?.isTerminal || false}
                      onChange={e => updateSelectedNodeConfig('isTerminal', e.target.checked)}
                      className="mt-1 rounded border-gray-300 w-4 h-4 text-primary focus:ring-primary"
                    />
                    <div>
                      <label htmlFor="isTerminal" className="text-sm font-medium leading-none cursor-pointer">Estado Terminal</label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Marca este estado como el final del ciclo. No permitirá más transiciones.
                      </p>
                    </div>
                  </div>

                  <div className="pt-2">
                    <label className="text-sm font-medium mb-1.5 block">Acción Automática (OnEnter)</label>
                    <select 
                      className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={(nodes.find(n => n.id === selectedNodeId) || {}).data?.stateConfig?.onEnterAction || ''}
                      onChange={e => updateSelectedNodeConfig('onEnterAction', e.target.value)}
                    >
                      <option value="">Ninguna</option>
                      <option value="CREATE_WORK_ORDER">Crear Orden de Trabajo</option>
                      <option value="NOTIFY_MANAGER">Notificar Supervisor</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Módulo Asociado (Delegación)</label>
                    <select 
                      className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={(nodes.find(n => n.id === selectedNodeId) || {}).data?.stateConfig?.associatedModule || ''}
                      onChange={e => updateSelectedNodeConfig('associatedModule', e.target.value)}
                    >
                      <option value="">Ninguno</option>
                      <option value="incidents">Módulo de Incidencias</option>
                      <option value="work_orders">Módulo de Órdenes de Trabajo</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Reglas de Transición */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-primary/80 uppercase tracking-wider">Reglas de Transición</h4>
                
                <div className="p-4 border rounded-lg bg-card space-y-4">
                  <div>
                    <label className="text-sm font-medium">Campos Requeridos</label>
                    <div className="mt-2 space-y-2 border rounded-md p-3 max-h-48 overflow-y-auto bg-background">
                      {(() => {
                        const currentFields = ((nodes.find(n => n.id === selectedNodeId) || {}).data?.stateConfig?.requiresFields || []) as string[];
                        const ghostFields = currentFields.filter(f => !availableFields.some(af => af.key === f));
                        
                        return (
                          <>
                            {ghostFields.map(ghost => (
                              <div key={ghost} className="flex items-center space-x-2 bg-destructive/10 p-1.5 rounded">
                                <input 
                                  type="checkbox"
                                  id={`field-${ghost}`}
                                  checked={true}
                                  onChange={(e) => {
                                    if (!e.target.checked) {
                                      const newFields = currentFields.filter(f => f !== ghost);
                                      updateSelectedNodeConfig('requiresFields', newFields);
                                    }
                                  }}
                                  className="rounded border-destructive w-4 h-4 text-destructive focus:ring-destructive"
                                />
                                <label htmlFor={`field-${ghost}`} className="text-sm font-medium leading-none cursor-pointer text-destructive">
                                  {ghost} <span className="text-xs font-normal">(No existe en esquema)</span>
                                </label>
                              </div>
                            ))}
                            {availableFields.length === 0 && ghostFields.length === 0 ? (
                              <p className="text-xs text-muted-foreground italic">No hay atributos definidos en el esquema.</p>
                            ) : (
                              availableFields.map(field => {
                                const isChecked = currentFields.includes(field.key);
                                return (
                                  <div key={field.key} className="flex items-center space-x-2">
                                    <input 
                                      type="checkbox"
                                      id={`field-${field.key}`}
                                      checked={isChecked}
                                      onChange={(e) => {
                                        let newFields;
                                        if (e.target.checked) {
                                          newFields = [...currentFields, field.key];
                                        } else {
                                          newFields = currentFields.filter(f => f !== field.key);
                                        }
                                        updateSelectedNodeConfig('requiresFields', newFields);
                                      }}
                                      className="rounded border-gray-300 w-4 h-4 text-primary focus:ring-primary"
                                    />
                                    <label htmlFor={`field-${field.key}`} className="text-sm font-medium leading-none cursor-pointer">
                                      {field.title} <span className="text-xs text-muted-foreground font-normal">({field.key})</span>
                                    </label>
                                  </div>
                                );
                              })
                            )}
                          </>
                        );
                      })()}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Selecciona los atributos que el usuario deberá completar antes de entrar a este estado.
                    </p>
                  </div>
                </div>
              </div>

              {/* Dependencias de Hijos */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-primary/80 uppercase tracking-wider">Propagación de Hijos</h4>
                
                <div className="p-4 border rounded-lg bg-card space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Define reglas para que este estado transicione automáticamente según el estado de los componentes dependientes (hijos).
                  </p>
                  
                  <div className="space-y-3">
                    {((nodes.find(n => n.id === selectedNodeId) || {}).data?.stateConfig?.childStateDependencies || []).map((dep: any, idx: number) => (
                      <div key={idx} className="p-3 border rounded-md bg-background shadow-sm space-y-3 relative group">
                        <div className="flex justify-between items-center pb-2 border-b">
                          <span className="font-semibold text-xs text-muted-foreground uppercase">Regla #{idx + 1}</span>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 text-red-500 opacity-50 group-hover:opacity-100 transition-opacity" 
                            onClick={() => {
                              const currentDeps = ((nodes.find(n => n.id === selectedNodeId) || {}).data?.stateConfig?.childStateDependencies || []).filter((_: any, i: number) => i !== idx);
                              updateSelectedNodeConfig('childStateDependencies', currentDeps);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        
                        <div>
                          <label className="text-[11px] uppercase text-muted-foreground font-semibold mb-1 block">Condición</label>
                          <select 
                            className="flex h-8 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            value={dep.conditionType || 'Any'}
                            onChange={e => {
                              const currentDeps = ((nodes.find(n => n.id === selectedNodeId) || {}).data?.stateConfig?.childStateDependencies || []).map((d: any, i: number) => 
                                i === idx ? { ...d, conditionType: e.target.value } : d
                              );
                              updateSelectedNodeConfig('childStateDependencies', currentDeps);
                            }}
                          >
                            <option value="Any">Si ALGUN hijo está en</option>
                            <option value="All">Si TODOS los hijos están en</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[11px] uppercase text-muted-foreground font-semibold mb-1 block">Estados de los hijos (separados por comas)</label>
                          <ChildStatesInput 
                            value={dep.childStates || []}
                            onChange={states => {
                              const currentDeps = ((nodes.find(n => n.id === selectedNodeId) || {}).data?.stateConfig?.childStateDependencies || []).map((d: any, i: number) => 
                                i === idx ? { ...d, childStates: states } : d
                              );
                              updateSelectedNodeConfig('childStateDependencies', currentDeps);
                            }}
                          />
                        </div>

                        <div>
                          <label className="text-[11px] uppercase text-muted-foreground font-semibold mb-1 block">Forzar Estado al Padre</label>
                          <Input 
                            className="h-8 text-xs font-medium" 
                            placeholder="Ej: Mantenimiento Parcial"
                            value={dep.targetState || ''} 
                            onChange={e => {
                              const currentDeps = ((nodes.find(n => n.id === selectedNodeId) || {}).data?.stateConfig?.childStateDependencies || []).map((d: any, i: number) => 
                                i === idx ? { ...d, targetState: e.target.value } : d
                              );
                              updateSelectedNodeConfig('childStateDependencies', currentDeps);
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <Button 
                    variant="secondary" 
                    size="sm" 
                    className="w-full mt-2"
                    onClick={() => {
                      const currentDeps = [...((nodes.find(n => n.id === selectedNodeId) || {}).data?.stateConfig?.childStateDependencies || [])];
                      currentDeps.push({ conditionType: 'Any', childStates: [], targetState: '' });
                      updateSelectedNodeConfig('childStateDependencies', currentDeps);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" /> Nueva Regla
                  </Button>
                </div>
              </div>
            </div>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}
