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

  // Initialize from value
  useEffect(() => {
    try {
      if (value) {
        const parsed = JSON.parse(value);
        if (parsed.nodes && parsed.edges) {
          setNodes(parsed.nodes);
          setEdges(parsed.edges);
        } else if (parsed.states && Array.isArray(parsed.states)) {
          // Fallback migration from old format
          const newNodes = parsed.states.map((state: string, idx: number) => ({
            id: state,
            data: { label: state },
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
    newNodes.forEach(n => transitions[n.id] = []);
    newEdges.forEach(e => {
      if (transitions[e.source] && !transitions[e.source].includes(e.target)) {
        transitions[e.source].push(e.target);
      }
    });
    const initialState = newNodes.length > 0 ? newNodes[0].id : "";

    onChange(JSON.stringify({ 
      initialState, 
      transitions,
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
      data: { label: newNodeName.trim() },
      position: { x: 100, y: 100 },
    };
    const newNodes = [...nodes, newNode];
    setNodes(newNodes);
    notifyChange(newNodes, edges);
    setNewNodeName('');
  };

  return (
    <div className="flex flex-col gap-4 border rounded-md p-4 h-[400px]">
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
          deleteKeyCode={['Backspace', 'Delete']}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}
