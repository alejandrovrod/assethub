import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  ControlButton,
  useReactFlow,
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
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  TooltipProvider,
} from '@/components/ui/tooltip';
import { Plus, Trash2, Settings, Info, AlertCircle, Star, Flag, Palette, Maximize, Focus } from 'lucide-react';

interface LifecycleCanvasProps {
  value: string;
  onChange: (value: string) => void;
  schemaJson?: string;
}

const ACTION_OPTIONS = [
  { value: '', label: 'Ninguna' },
  { value: 'CREATE_WORK_ORDER', label: 'Crear Orden de Trabajo' },
  { value: 'NOTIFY_MANAGER', label: 'Notificar Supervisor' },
];

const MODULE_OPTIONS = [
  { value: '', label: 'Ninguno' },
  { value: 'incidents', label: 'Módulo de Incidencias' },
  { value: 'work_orders', label: 'Módulo de Órdenes de Trabajo' },
];

const CONDITION_OPTIONS = [
  { value: 'Any', label: 'Si ALGÚN hijo está en' },
  { value: 'All', label: 'Si TODOS los hijos están en' },
];

function ChildStatesInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (states: string[]) => void;
}) {
  const [text, setText] = useState(value.join(', '));

  return (
    <Input
      className="h-8 text-xs"
      placeholder="Ej: Activo, Instalado_Activo"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean));
      }}
      onBlur={() => setText(value.join(', '))}
    />
  );
}

function CustomControls({ wrapperRef }: { wrapperRef: React.RefObject<HTMLDivElement | null> }) {
  const { fitView } = useReactFlow();

  const toggleFullscreen = () => {
    if (!document.fullscreenElement && wrapperRef.current) {
      wrapperRef.current.requestFullscreen().catch((err) => {
        console.error('Error attempting to enable fullscreen mode:', err);
      });
    } else if (document.fullscreenElement) {
      document.exitFullscreen().catch((err) => {
        console.error('Error attempting to exit fullscreen mode:', err);
      });
    }
  };

  return (
    <Controls showFitView={false}>
      <ControlButton 
        onClick={() => fitView({ duration: 800 })} 
        title="Ajustar y Centrar Vista"
        aria-label="Ajustar y Centrar Vista"
      >
        <Focus className="h-4 w-4" />
      </ControlButton>
      <ControlButton 
        onClick={toggleFullscreen} 
        title="Pantalla Completa"
        aria-label="Pantalla Completa"
      >
        <Maximize className="h-4 w-4" />
      </ControlButton>
    </Controls>
  );
}

// -- Semantic Colors & Smart Defaults --
const PRESET_COLORS = [
  { label: 'Gris (Borrador / Neutro)', value: '#94a3b8' },
  { label: 'Azul (En progreso / Asignado)', value: '#3b82f6' },
  { label: 'Verde (Completado / Resuelto)', value: '#10b981' },
  { label: 'Rojo (Problema / Cancelado)', value: '#ef4444' },
  { label: 'Amarillo (Espera / Pausado)', value: '#f59e0b' },
  { label: 'Morado (Especial / Externo)', value: '#8b5cf6' },
];

const getSmartColorForState = (stateName: string) => {
  const lower = stateName.toLowerCase();
  if (lower.match(/completado|cerrado|resuelto|aprobado|listo/)) return '#10b981'; // Green
  if (lower.match(/falla|cancelado|rechazado|error|cr[íi]tico/)) return '#ef4444'; // Red
  if (lower.match(/progreso|asignado|revisi[óo]n|curso|reparaci[óo]n/)) return '#3b82f6'; // Blue
  if (lower.match(/espera|pausado|pendiente|diagn[óo]stico/)) return '#f59e0b'; // Yellow
  if (lower.match(/especial|externo/)) return '#8b5cf6'; // Purple
  return '#94a3b8'; // Default Gray
};

function ColorSwatchPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const [isCustom, setIsCustom] = useState(() => !PRESET_COLORS.some((c) => c.value === value));
  const [localColor, setLocalColor] = useState(value);

  useEffect(() => {
    setLocalColor(value);
    setIsCustom(!PRESET_COLORS.some((c) => c.value === value));
  }, [value]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {PRESET_COLORS.map((c) => (
          <button
            key={c.value}
            title={c.label}
            onClick={() => {
              setIsCustom(false);
              onChange(c.value);
            }}
            className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${
              value === c.value && !isCustom
                ? 'border-primary ring-2 ring-primary/20 scale-110'
                : 'border-transparent'
            }`}
            style={{ backgroundColor: c.value }}
          />
        ))}

        <button
          title="Color Personalizado"
          onClick={() => setIsCustom(true)}
          className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all bg-muted ${
            isCustom
              ? 'border-primary ring-2 ring-primary/20 scale-110'
              : 'border-dashed border-muted-foreground hover:border-solid hover:scale-110'
          }`}
        >
          <Palette className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {isCustom && (
        <div className="flex items-center gap-2 pt-2 animate-in fade-in slide-in-from-top-2">
          <Input
            type="color"
            value={localColor}
            onChange={(e) => setLocalColor(e.target.value)}
            onBlur={() => {
              if (localColor !== value) onChange(localColor);
            }}
            className="h-8 w-14 p-1 cursor-pointer"
          />
          <span className="text-xs text-muted-foreground font-mono">
            {localColor.toUpperCase()}
          </span>
        </div>
      )}
    </div>
  );
}

export function LifecycleCanvas({ value, onChange, schemaJson }: LifecycleCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [newNodeName, setNewNodeName] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState('');
  const [showHelp, setShowHelp] = useState(true);
  const lastSerializedValue = useRef<string>('');

  const availableFields = useMemo(() => {
    try {
      if (!schemaJson) return [];
      const schema = JSON.parse(schemaJson);
      if (schema?.properties) {
        return Object.keys(schema.properties).map((key) => ({
          key,
          title: schema.properties[key].title || key,
        }));
      }
    } catch (e) {
      return [];
    }
    return [];
  }, [schemaJson]);

  const availableTargetFields = useMemo(() => {
    try {
      if (!schemaJson) return [];
      const schema = JSON.parse(schemaJson);
      if (schema?.properties) {
        return Object.keys(schema.properties)
          .filter((key) => schema.properties[key].format === 'employee' || schema.properties[key].format === 'team')
          .map((key) => ({
            key,
            title: schema.properties[key].title || key,
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
      const stateConfigs = parsed.states || parsed.States || {};
      const transitions = parsed.transitions || {};
      const initialStateId = parsed.initialState || '';

      const buildNodesFromStates = () => {
        const stateNames = Object.keys(stateConfigs).length > 0
          ? Object.keys(stateConfigs)
          : Object.keys(transitions);

        return stateNames.map((state: string, idx: number) => {
          const config = stateConfigs[state] || {};
          const isInitial = state === initialStateId || (idx === 0 && !initialStateId);
          return {
            id: state,
            data: {
              label: state,
              stateConfig: {
                color: config.color || config.Color || '#94a3b8',
                isTerminal: config.isTerminal ?? config.IsTerminal ?? false,
                requiresFields: config.requiresFields || config.RequiresFields || [],
                allowedRoles: config.allowedRoles || config.AllowedRoles || [],
                onEnterAction: config.onEnterAction || config.OnEnterAction || '',
                notificationTargetFieldId: config.notificationTargetFieldId || config.NotificationTargetFieldId || '',
                associatedModule: config.associatedModule || config.AssociatedModule || '',
                childStateDependencies:
                  config.childStateDependencies || config.ChildStateDependencies || [],
              },
              isInitial,
            },
            position: { x: 100 + (idx % 4) * 180, y: 100 + Math.floor(idx / 4) * 120 },
            style: {
              backgroundColor: config.color || config.Color || '#ffffff',
              border: `2px solid ${
                isInitial ? '#16a34a' : config.isTerminal ? '#dc2626' : config.color || config.Color || '#94a3b8'
              }`,
              borderRadius: '8px',
              padding: '10px',
              color: '#000',
              fontWeight: 'bold',
            },
          };
        });
      };

      const buildEdgesFromTransitions = () => {
        const edgeList: Edge[] = [];
        Object.entries(transitions).forEach(([source, targets]: [string, any]) => {
          if (Array.isArray(targets)) {
            targets.forEach((target: string, idx: number) => {
              edgeList.push({
                id: `e-${source}-${target}-${idx}`,
                source,
                target,
                markerEnd: { type: MarkerType.ArrowClosed },
              });
            });
          }
        });
        return edgeList;
      };

      if (parsed.nodes && Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
        const loadedNodes = parsed.nodes.map((n: Node) => {
          const config = stateConfigs[n.id] || {};
          const isInitial = n.id === initialStateId;
          return {
            ...n,
            data: {
              ...n.data,
              stateConfig: {
                color: config.color || config.Color || '#94a3b8',
                isTerminal: config.isTerminal ?? config.IsTerminal ?? false,
                requiresFields: config.requiresFields || config.RequiresFields || [],
                allowedRoles: config.allowedRoles || config.AllowedRoles || [],
                onEnterAction: config.onEnterAction || config.OnEnterAction || '',
                notificationTargetFieldId: config.notificationTargetFieldId || config.NotificationTargetFieldId || '',
                associatedModule: config.associatedModule || config.AssociatedModule || '',
                childStateDependencies:
                  config.childStateDependencies || config.ChildStateDependencies || [],
              },
              isInitial,
            },
            style: {
              ...n.style,
              backgroundColor: config.color || config.Color || '#ffffff',
              border: `2px solid ${
                isInitial ? '#16a34a' : config.isTerminal ? '#dc2626' : config.color || config.Color || '#94a3b8'
              }`,
              borderRadius: '8px',
              padding: '10px',
              color: '#000',
              fontWeight: 'bold',
            },
          };
        });
        setNodes(loadedNodes);
        setEdges(parsed.edges && parsed.edges.length > 0 ? parsed.edges : buildEdgesFromTransitions());
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
              notificationTargetFieldId: '',
              associatedModule: '',
              childStateDependencies: [],
            },
            isInitial: idx === 0,
          },
          position: { x: 100 + idx * 150, y: 100 },
        }));
        setNodes(newNodes);
        setEdges(buildEdgesFromTransitions());
      } else if (Object.keys(stateConfigs).length > 0 || Object.keys(transitions).length > 0) {
        // Rebuild from transitions/states
        const newNodes = buildNodesFromStates();
        setNodes(newNodes);
        setEdges(buildEdgesFromTransitions());
      }
    } catch (e) {
      console.error('Error parsing lifecycle JSON', e);
    }
  }, [value]);

  const initialState = useMemo(() => {
    const node = nodes.find((n) => n.data?.isInitial);
    return node?.id || '';
  }, [nodes]);

  const notifyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync to parent when nodes/edges change
  const notifyChange = useCallback(
    (newNodes: Node[], newEdges: Edge[]) => {
      if (notifyTimeoutRef.current) clearTimeout(notifyTimeoutRef.current);
      
      notifyTimeoutRef.current = setTimeout(() => {
        const transitions: Record<string, string[]> = {};
      const states: Record<string, any> = {};

      newNodes.forEach((n) => {
        transitions[n.id] = [];
        const config = n.data?.stateConfig || {};
        states[n.id] = {
          color: config.color || '#94a3b8',
          isTerminal: config.isTerminal || false,
          requiresFields: config.requiresFields || [],
          allowedRoles: config.allowedRoles || [],
          onEnterAction: config.onEnterAction || '',
          notificationTargetFieldId: config.notificationTargetFieldId || '',
          associatedModule: config.associatedModule || '',
          childStateDependencies: config.childStateDependencies || [],
        };
      });

      newEdges.forEach((e) => {
        if (transitions[e.source] && !transitions[e.source].includes(e.target)) {
          transitions[e.source].push(e.target);
        }
      });
      const computedInitial = newNodes.find((n) => n.data?.isInitial)?.id || (newNodes.length > 0 ? newNodes[0].id : '');

      const jsonStr = JSON.stringify(
        {
          initialState: computedInitial,
          transitions,
          states,
          nodes: newNodes,
          edges: newEdges,
        },
        null,
        2
      );

        lastSerializedValue.current = jsonStr;
        onChange(jsonStr);
      }, 300);
    },
    [onChange]
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => {
        const newNodes = applyNodeChanges(changes, nds);

        const onlyPositionDragging =
          changes.length > 0 &&
          changes.every(
            (c) => c.type === 'position' && c.dragging === true
          );

        if (!onlyPositionDragging) {
          notifyChange(newNodes, edges);
        }

        return newNodes;
      });
    },
    [edges, notifyChange]
  );

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, _node: Node, _nodes: Node[]) => {
      setNodes((nds) => {
        notifyChange(nds, edges);
        return nds;
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
    if (nodes.some((n) => n.id === name)) {
      alert('Ya existe un estado con ese nombre');
      return;
    }
    const newNode: Node = {
      id: name,
      data: {
        label: name,
        stateConfig: {
          color: getSmartColorForState(name),
          isTerminal: false,
          requiresFields: [],
          allowedRoles: [],
          onEnterAction: '',
          notificationTargetFieldId: '',
          associatedModule: '',
          childStateDependencies: [],
        },
        isInitial: nodes.length === 0,
      },
      position: { x: 100 + nodes.length * 30, y: 100 + nodes.length * 30 },
      style: {
        backgroundColor: nodes.length === 0 ? '#dcfce7' : '#ffffff',
        border: `2px solid ${nodes.length === 0 ? '#16a34a' : '#94a3b8'}`,
        borderRadius: '8px',
        padding: '10px',
        color: '#000',
        fontWeight: 'bold',
      },
    };
    const newNodes = [...nodes, newNode];
    setNodes(newNodes);
    notifyChange(newNodes, edges);
    setNewNodeName('');
  };

  const handleSetInitial = (nodeId: string) => {
    const newNodes = nodes.map((n) => ({
      ...n,
      data: { ...n.data, isInitial: n.id === nodeId },
      style: {
        ...n.style,
        backgroundColor: n.data?.stateConfig?.color || '#ffffff',
        border: `2px solid ${
          n.id === nodeId
            ? '#16a34a'
            : n.data?.stateConfig?.isTerminal
              ? '#dc2626'
              : n.data?.stateConfig?.color || '#94a3b8'
        }`,
      },
    }));
    setNodes(newNodes);
    notifyChange(newNodes, edges);
  };

  const onNodeClick = (_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
    setEditingNodeId(node.id);
  };

  const updateSelectedNodeConfig = (key: string, value: any) => {
    if (!selectedNodeId) return;

    setNodes((prevNodes) => {
      const newNodes = prevNodes.map((n) => {
        if (n.id === selectedNodeId) {
          const newStateConfig = { ...(n.data.stateConfig || {}), [key]: value };
          const isTerminal = key === 'isTerminal' ? value : newStateConfig.isTerminal;
          const isInitial = n.data?.isInitial;
          return {
            ...n,
            data: {
              ...n.data,
              stateConfig: newStateConfig,
            },
            style: {
              ...n.style,
              backgroundColor: newStateConfig.color || '#ffffff',
              border: `2px solid ${
                isInitial ? '#16a34a' : isTerminal ? '#dc2626' : newStateConfig.color || '#94a3b8'
              }`,
            },
          };
        }
        return n;
      });

      notifyChange(newNodes, edges);
      return newNodes;
    });
  };

  const handleRenameNode = () => {
    const selectedNode = nodes.find((n) => n.id === selectedNodeId);
    if (!selectedNode || !editingNodeId.trim()) return;
    const newId = editingNodeId.trim();
    const oldId = selectedNode.id;
    if (newId === oldId) return;

    if (nodes.some((n) => n.id === newId)) {
      alert('Ya existe un estado con ese nombre');
      setEditingNodeId(oldId);
      return;
    }

    setNodes((prevNodes) => {
      const newNodes = prevNodes.map((n) => {
        if (n.id === oldId) {
          return {
            ...n,
            id: newId,
            data: { ...n.data, label: newId },
          };
        }
        return n;
      });

      setEdges((prevEdges) => {
        const newEdges = prevEdges.map((e) => {
          let updated = { ...e };
          if (e.source === oldId) updated.source = newId;
          if (e.target === oldId) updated.target = newId;
          return updated;
        });

        notifyChange(newNodes, newEdges);
        return newEdges;
      });

      const updatedNode = newNodes.find((n) => n.id === newId);
      if (updatedNode) setSelectedNodeId(updatedNode.id);

      return newNodes;
    });
  };

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId),
    [nodes, selectedNodeId]
  );

  const validationMessages = useMemo(() => {
    const messages: string[] = [];
    if (nodes.length > 0 && !initialState) {
      messages.push('Definí un estado inicial.');
    }
    nodes.forEach((n) => {
      const config = n.data?.stateConfig || {};
      if (config.isTerminal) {
        const hasOutgoing = edges.some((e) => e.source === n.id);
        if (hasOutgoing) {
          messages.push(`El estado terminal "${n.id}" no debería tener salidas.`);
        }
      }
    });
    return messages;
  }, [nodes, edges, initialState]);

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4 border rounded-md p-4 bg-muted/10">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="space-y-1">
              <h4 className="text-sm font-semibold">Ciclo de vida del activo</h4>
              <p className="text-sm text-muted-foreground max-w-2xl">
                Creá los estados por los que pasará el activo y conectálos con flechas para indicar
                las transiciones permitidas. El primer estado que agregues se marca como inicial.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowHelp((v) => !v)}
              >
                <Info className="h-4 w-4 mr-2" />
                {showHelp ? 'Ocultar ayuda' : 'Mostrar ayuda'}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  const val = prompt('Pegá el JSON aquí:');
                  if (val) {
                    try {
                      JSON.parse(val);
                      onChange(val);
                    } catch (e) {
                      alert('El JSON ingresado no es válido');
                    }
                  }
                }}
                variant="outline"
                size="sm"
              >
                Importar JSON
              </Button>
            </div>
          </div>

          {showHelp && (
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline" className="gap-1 bg-green-50 text-green-700 border-green-200">
                <Star className="h-3 w-3" />
                Estado inicial
              </Badge>
              <Badge variant="outline" className="gap-1 bg-red-50 text-red-700 border-red-200">
                <Flag className="h-3 w-3" />
                Estado terminal
              </Badge>
              <Badge variant="outline" className="gap-1">
                Clic en un estado para editarlo
              </Badge>
              <Badge variant="outline" className="gap-1">
                Arrastrá entre puntos para conectar estados
              </Badge>
              <Badge variant="outline" className="gap-1">
                Delete / Backspace para borrar lo seleccionado
              </Badge>
            </div>
          )}

          {validationMessages.length > 0 && (
            <div className="flex flex-col gap-1 text-xs text-destructive bg-destructive/10 p-2 rounded-md">
              {validationMessages.map((msg, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span>{msg}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col lg:flex-row gap-4 h-[500px]">
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
            </div>
            <div ref={wrapperRef} className="flex-1 border rounded bg-background overflow-hidden relative">
              <style>{`
                .react-flow__node.selected {
                  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.4) !important;
                  transition: box-shadow 0.2s ease-in-out;
                }
              `}</style>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeDragStop={onNodeDragStop}
                onNodeClick={onNodeClick}
                onPaneClick={() => setSelectedNodeId(null)}
                deleteKeyCode={['Backspace', 'Delete']}
                fitView
              >
                <Background />
                <CustomControls wrapperRef={wrapperRef} />
              </ReactFlow>
            </div>
          </div>

          {/* Node Properties Panel (Dialog) */}
          <Dialog open={!!selectedNodeId} onOpenChange={(open) => !open && setSelectedNodeId(null)}>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
              <DialogHeader className="pt-2 pb-4 border-b mb-6">
                <DialogTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5 text-muted-foreground" />
                  Configurar Estado
                </DialogTitle>
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    value={editingNodeId}
                    onChange={(e) => setEditingNodeId(e.target.value)}
                    onBlur={handleRenameNode}
                    onKeyDown={(e) => e.key === 'Enter' && handleRenameNode()}
                    className="font-semibold text-lg"
                  />
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Configurá las propiedades visuales y reglas de negocio para este estado.
                </p>
              </DialogHeader>

              {selectedNode && (
                <div className="px-4 pb-6 space-y-6">
                  <div className="flex items-center gap-2">
                    {selectedNode.data?.isInitial ? (
                      <span className="flex items-center text-sm font-medium text-green-700 bg-green-50 px-3 py-1.5 rounded-md border border-green-200">
                        <Star className="h-4 w-4 mr-2" />
                        Este es el estado inicial
                      </span>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleSetInitial(selectedNode.id)}
                      >
                        <Star className="h-4 w-4 mr-2" />
                        Marcar como inicial
                      </Button>
                    )}
                  </div>

                  {/* Apariencia */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-primary/80 uppercase tracking-wider">
                      Apariencia
                    </h4>

                    <div className="flex flex-col gap-3 p-3 border rounded-lg bg-card">
                      <div>
                        <Label className="text-sm font-medium">Color de Etiqueta</Label>
                        <p className="text-xs text-muted-foreground">El color predeterminado se asigna por el nombre del estado.</p>
                      </div>
                      <ColorSwatchPicker
                        value={selectedNode.data?.stateConfig?.color || '#94a3b8'}
                        onChange={(val) => updateSelectedNodeConfig('color', val)}
                      />
                    </div>
                  </div>

                  {/* Configuración de Comportamiento */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-primary/80 uppercase tracking-wider">
                      Comportamiento
                    </h4>

                    <div className="p-4 border rounded-lg bg-card space-y-4">
                      <div className="flex items-start gap-3">
                        <Switch
                          id="isTerminal"
                          checked={selectedNode.data?.stateConfig?.isTerminal || false}
                          onCheckedChange={(c) => updateSelectedNodeConfig('isTerminal', c)}
                        />
                        <div>
                          <Label htmlFor="isTerminal" className="text-sm font-medium cursor-pointer">
                            Estado Terminal
                          </Label>
                          <p className="text-xs text-muted-foreground mt-1">
                            Marcá este estado como el final del ciclo. No permitirá más transiciones.
                          </p>
                        </div>
                      </div>

                      <div className="pt-2 space-y-1.5">
                        <Label className="text-sm font-medium">Acción Automática (OnEnter)</Label>
                        <Select
                          value={selectedNode.data?.stateConfig?.onEnterAction || ''}
                          onValueChange={(val) => updateSelectedNodeConfig('onEnterAction', val)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ACTION_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {selectedNode.data?.stateConfig?.onEnterAction === 'NOTIFY_MANAGER' && (
                        <div className="pt-2 space-y-1.5 animate-in fade-in slide-in-from-top-2">
                          <Label className="text-sm font-medium">Campo Destinatario de Notificación</Label>
                          <Select
                            value={selectedNode.data?.stateConfig?.notificationTargetFieldId || ''}
                            onValueChange={(val) => updateSelectedNodeConfig('notificationTargetFieldId', val)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccioná un campo de Empleado o Equipo" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableTargetFields.length === 0 ? (
                                <SelectItem value="_empty_" disabled>
                                  No hay campos de Empleado/Equipo en la plantilla
                                </SelectItem>
                              ) : (
                                availableTargetFields.map((field) => (
                                  <SelectItem key={field.key} value={field.key}>
                                    {field.title}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium">Módulo Asociado (Delegación)</Label>
                        <Select
                          value={selectedNode.data?.stateConfig?.associatedModule || ''}
                          onValueChange={(val) => updateSelectedNodeConfig('associatedModule', val)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MODULE_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  {/* Reglas de Transición */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-primary/80 uppercase tracking-wider">
                      Reglas de Transición
                    </h4>

                    <div className="p-4 border rounded-lg bg-card space-y-4">
                      <div>
                        <Label className="text-sm font-medium">Campos Requeridos</Label>
                        <div className="mt-2 space-y-2 border rounded-md p-3 max-h-48 overflow-y-auto bg-background">
                          {(() => {
                            const currentFields = (selectedNode.data?.stateConfig?.requiresFields || []) as string[];
                            const ghostFields = currentFields.filter(
                              (f) => !availableFields.some((af) => af.key === f)
                            );

                            return (
                              <>
                                {ghostFields.map((ghost) => (
                                  <div
                                    key={ghost}
                                    className="flex items-center space-x-2 bg-destructive/10 p-1.5 rounded"
                                  >
                                    <Switch
                                      id={`field-${ghost}`}
                                      checked={true}
                                      onCheckedChange={(c) => {
                                        if (!c) {
                                          const newFields = currentFields.filter((f) => f !== ghost);
                                          updateSelectedNodeConfig('requiresFields', newFields);
                                        }
                                      }}
                                    />
                                    <Label
                                      htmlFor={`field-${ghost}`}
                                      className="text-sm font-medium cursor-pointer text-destructive"
                                    >
                                      {ghost}{' '}
                                      <span className="text-xs font-normal">(No existe en esquema)</span>
                                    </Label>
                                  </div>
                                ))}
                                {availableFields.length === 0 && ghostFields.length === 0 ? (
                                  <p className="text-xs text-muted-foreground italic">
                                    No hay atributos definidos en el esquema.
                                  </p>
                                ) : (
                                  availableFields.map((field) => {
                                    const isChecked = currentFields.includes(field.key);
                                    return (
                                      <div key={field.key} className="flex items-center space-x-2">
                                        <Switch
                                          id={`field-${field.key}`}
                                          checked={isChecked}
                                          onCheckedChange={(c) => {
                                            const newFields = c
                                              ? [...currentFields, field.key]
                                              : currentFields.filter((f) => f !== field.key);
                                            updateSelectedNodeConfig('requiresFields', newFields);
                                          }}
                                        />
                                        <Label
                                          htmlFor={`field-${field.key}`}
                                          className="text-sm font-medium cursor-pointer"
                                        >
                                          {field.title}{' '}
                                          <span className="text-xs text-muted-foreground font-normal">
                                            ({field.key})
                                          </span>
                                        </Label>
                                      </div>
                                    );
                                  })
                                )}
                              </>
                            );
                          })()}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1.5">
                          Seleccioná los atributos que el usuario deberá completar antes de entrar a este
                          estado.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Dependencias de Hijos */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-primary/80 uppercase tracking-wider">
                      Propagación de Hijos
                    </h4>

                    <div className="p-4 border rounded-lg bg-card space-y-4">
                      <p className="text-xs text-muted-foreground">
                        Definí reglas para que este estado transicione automáticamente según el estado
                        de los componentes dependientes (hijos).
                      </p>

                      <div className="space-y-3">
                        {(selectedNode.data?.stateConfig?.childStateDependencies || []).map(
                          (dep: any, idx: number) => (
                            <div
                              key={idx}
                              className="p-3 border rounded-md bg-background shadow-sm space-y-3 relative group"
                            >
                              <div className="flex justify-between items-center pb-2 border-b">
                                <span className="font-semibold text-xs text-muted-foreground uppercase">
                                  Regla #{idx + 1}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-red-500 opacity-50 group-hover:opacity-100 transition-opacity"
                                  onClick={() => {
                                    const currentDeps = (
                                      selectedNode.data?.stateConfig?.childStateDependencies || []
                                    ).filter((_: any, i: number) => i !== idx);
                                    updateSelectedNodeConfig('childStateDependencies', currentDeps);
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>

                              <div className="space-y-1.5">
                                <Label className="text-[11px] uppercase text-muted-foreground font-semibold">
                                  Condición
                                </Label>
                                <Select
                                  value={dep.conditionType || 'Any'}
                                  onValueChange={(val) => {
                                    const currentDeps = (
                                      selectedNode.data?.stateConfig?.childStateDependencies || []
                                    ).map((d: any, i: number) =>
                                      i === idx ? { ...d, conditionType: val } : d
                                    );
                                    updateSelectedNodeConfig('childStateDependencies', currentDeps);
                                  }}
                                >
                                  <SelectTrigger className="text-xs h-8">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {CONDITION_OPTIONS.map((opt) => (
                                      <SelectItem key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="space-y-1.5">
                                <Label className="text-[11px] uppercase text-muted-foreground font-semibold">
                                  Estados de los hijos (separados por comas)
                                </Label>
                                <ChildStatesInput
                                  value={dep.childStates || []}
                                  onChange={(states) => {
                                    const currentDeps = (
                                      selectedNode.data?.stateConfig?.childStateDependencies || []
                                    ).map((d: any, i: number) =>
                                      i === idx ? { ...d, childStates: states } : d
                                    );
                                    updateSelectedNodeConfig('childStateDependencies', currentDeps);
                                  }}
                                />
                              </div>

                              <div className="space-y-1.5">
                                <Label className="text-[11px] uppercase text-muted-foreground font-semibold">
                                  Forzar Estado al Padre
                                </Label>
                                <Input
                                  className="h-8 text-xs font-medium"
                                  placeholder="Ej: Mantenimiento Parcial"
                                  value={dep.targetState || ''}
                                  onChange={(e) => {
                                    const currentDeps = (
                                      selectedNode.data?.stateConfig?.childStateDependencies || []
                                    ).map((d: any, i: number) =>
                                      i === idx ? { ...d, targetState: e.target.value } : d
                                    );
                                    updateSelectedNodeConfig('childStateDependencies', currentDeps);
                                  }}
                                />
                              </div>
                            </div>
                          )
                        )}
                      </div>

                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full mt-2"
                        onClick={() => {
                          const currentDeps = [
                            ...(selectedNode.data?.stateConfig?.childStateDependencies || []),
                          ];
                          currentDeps.push({ conditionType: 'Any', childStates: [], targetState: '' });
                          updateSelectedNodeConfig('childStateDependencies', currentDeps);
                        }}
                      >
                        <Plus className="h-4 w-4 mr-2" /> Nueva Regla
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </TooltipProvider>
  );
}
