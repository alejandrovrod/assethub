import { useState, useCallback, useEffect } from 'react';
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
import { Plus } from 'lucide-react';

interface LifecycleCanvasProps {
  value: string;
  onChange: (value: string) => void;
}

export function LifecycleCanvas({ value, onChange }: LifecycleCanvasProps) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [newNodeName, setNewNodeName] = useState('');
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [fieldsText, setFieldsText] = useState('');

  // Initialize from value
  useEffect(() => {
    try {
      if (value) {
        const parsed = JSON.parse(value);
        if (parsed.nodes && parsed.edges) {
          // Si tenemos states en el JSON, los fusionamos en el node.data para que el editor los vea
          const loadedNodes = parsed.nodes.map((n: Node) => {
            const stateConfig = parsed.states?.[n.id] || {};
            return {
              ...n,
              data: {
                ...n.data,
                stateConfig: {
                  color: stateConfig.color || '#94a3b8',
                  isTerminal: stateConfig.isTerminal || false,
                  requiresFields: stateConfig.requiresFields || [],
                  allowedRoles: stateConfig.allowedRoles || [],
                  onEnterAction: stateConfig.onEnterAction || ''
                }
              },
              style: { 
                ...n.style, 
                backgroundColor: stateConfig.color || '#ffffff',
                border: `2px solid ${stateConfig.color || '#94a3b8'}`,
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
            data: { label: state, stateConfig: { color: '#94a3b8', isTerminal: false, requiresFields: [], allowedRoles: [], onEnterAction: '' } },
            position: { x: 100 + idx * 150, y: 100 },
          }));
          setNodes(newNodes);
        }
      }
    } catch (e) {
      console.error('Error parsing lifecycle JSON', e);
    }
  }, []); // Only run once on mount

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
        onEnterAction: config.onEnterAction || ''
      };
    });

    newEdges.forEach(e => {
      if (transitions[e.source] && !transitions[e.source].includes(e.target)) {
        transitions[e.source].push(e.target);
      }
    });
    const initialState = newNodes.length > 0 ? newNodes[0].id : "";

    onChange(JSON.stringify({ 
      initialState, 
      transitions,
      states,
      nodes: newNodes, 
      edges: newEdges 
    }, null, 2));
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
    const newNode: Node = {
      id: newNodeName.trim(),
      data: { 
        label: newNodeName.trim(), 
        stateConfig: { color: '#94a3b8', isTerminal: false, requiresFields: [], allowedRoles: [], onEnterAction: '' } 
      },
      position: { x: 100, y: 100 },
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

  const onNodeClick = (_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setFieldsText((node.data?.stateConfig?.requiresFields || []).join(', '));
  };

  const updateSelectedNodeConfig = (key: string, value: any) => {
    if (!selectedNode) return;
    
    setNodes(nds => {
      const newNodes = nds.map(n => {
        if (n.id === selectedNode.id) {
          const newStateConfig = { ...(n.data?.stateConfig || {}), [key]: value };
          return {
            ...n,
            data: { ...n.data, stateConfig: newStateConfig },
            style: key === 'color' ? { ...n.style, border: `2px solid ${value}` } : n.style
          };
        }
        return n;
      });
      
      const updatedNode = newNodes.find(n => n.id === selectedNode.id);
      if (updatedNode) setSelectedNode(updatedNode);
      
      notifyChange(newNodes, edges);
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
        </div>
        <div className="flex-1 border rounded bg-muted/20 overflow-hidden relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={() => setSelectedNode(null)}
            deleteKeyCode={['Backspace', 'Delete']}
            fitView
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>
      </div>
      
      {/* Node Properties Panel */}
      {selectedNode && (
        <div className="w-80 border-l pl-4 overflow-y-auto">
          <h3 className="font-semibold text-lg mb-4">Configurar Estado</h3>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Estado</label>
              <div className="text-sm text-muted-foreground">{selectedNode.id}</div>
            </div>
            
            <div>
              <label className="text-sm font-medium">Color</label>
              <Input 
                type="color" 
                value={selectedNode.data?.stateConfig?.color || '#94a3b8'} 
                onChange={e => updateSelectedNodeConfig('color', e.target.value)}
                className="h-10 p-1 mt-1"
              />
            </div>
            
            <div className="flex items-center gap-2 mt-4">
              <input 
                type="checkbox" 
                id="isTerminal"
                checked={selectedNode.data?.stateConfig?.isTerminal || false}
                onChange={e => updateSelectedNodeConfig('isTerminal', e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor="isTerminal" className="text-sm font-medium">Estado Terminal</label>
            </div>
            <p className="text-xs text-muted-foreground mb-4">No permite más transiciones de salida.</p>

            <div>
              <label className="text-sm font-medium">Acción Automática (OnEnter)</label>
              <select 
                className="w-full mt-1 border rounded p-2 text-sm"
                value={selectedNode.data?.stateConfig?.onEnterAction || ''}
                onChange={e => updateSelectedNodeConfig('onEnterAction', e.target.value)}
              >
                <option value="">Ninguna</option>
                <option value="CREATE_WORK_ORDER">Crear Orden de Trabajo</option>
                <option value="NOTIFY_MANAGER">Notificar Supervisor</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">Módulo Asociado (Delegación)</label>
              <select 
                className="w-full mt-1 border rounded p-2 text-sm"
                value={selectedNode.data?.stateConfig?.associatedModule || ''}
                onChange={e => updateSelectedNodeConfig('associatedModule', e.target.value)}
              >
                <option value="">Ninguno</option>
                <option value="incidents">Módulo de Incidencias</option>
                <option value="work_orders">Módulo de Órdenes de Trabajo</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">Campos Requeridos (separados por coma)</label>
              <Input 
                placeholder="ej: motivo_falla, foto" 
                value={fieldsText} 
                onChange={e => {
                  setFieldsText(e.target.value);
                  const vals = e.target.value.split(',').map(s => s.trim()).filter(s => s);
                  updateSelectedNodeConfig('requiresFields', vals);
                }}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">El usuario deberá completar estos campos antes de transicionar.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
