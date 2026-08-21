import { useState, useEffect } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { GripVertical, Plus, Trash2 } from 'lucide-react'

export interface ChecklistTask {
  id: string
  title: string
  description?: string
  frequency?: string
}

interface MaintenanceChecklistBuilderProps {
  value: string
  onChange: (value: string) => void
}

function generateId() {
  return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

function SortableTask({
  task,
  onUpdate,
  onDelete,
}: {
  task: ChecklistTask
  onUpdate: (id: string, updates: Partial<ChecklistTask>) => void
  onDelete: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: task.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-col gap-2 p-3 bg-card border rounded-md shadow-sm"
    >
      <div className="flex items-center gap-2">
        <div
          {...attributes}
          {...listeners}
          tabIndex={-1}
          className="cursor-grab text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="h-5 w-5" />
        </div>
        <Input
          value={task.title}
          onChange={(e) => onUpdate(task.id, { title: e.target.value })}
          placeholder="Nombre de la tarea (ej. Revisar nivel de aceite)"
          className="flex-1"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:bg-destructive/10"
          onClick={() => onDelete(task.id)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-7">
        <Input
          value={task.frequency || ''}
          onChange={(e) => onUpdate(task.id, { frequency: e.target.value })}
          placeholder="Frecuencia sugerida (ej. Cada 5.000 km)"
          className="text-sm"
        />
        <Textarea
          value={task.description || ''}
          onChange={(e) => onUpdate(task.id, { description: e.target.value })}
          placeholder="Instrucciones breves..."
          className="text-sm min-h-[2.5rem] resize-none"
          rows={1}
        />
      </div>
    </div>
  )
}

export function MaintenanceChecklistBuilder({ value, onChange }: MaintenanceChecklistBuilderProps) {
  const [tasks, setTasks] = useState<ChecklistTask[]>([])

  useEffect(() => {
    try {
      const parsed = value ? JSON.parse(value) : null
      if (parsed && Array.isArray(parsed.tasks)) {
        setTasks(parsed.tasks.map((t: any) => ({
          id: t.id || generateId(),
          title: t.title || '',
          description: t.description || '',
          frequency: t.frequency || '',
        })))
      } else {
        setTasks([])
      }
    } catch {
      setTasks([])
    }
  }, [value])

  const notifyChange = (newTasks: ChecklistTask[]) => {
    const payload = {
      tasks: newTasks.map(({ id, ...rest }) => rest),
    }
    onChange(JSON.stringify(payload, null, 2))
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setTasks((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id)
        const newIndex = items.findIndex((i) => i.id === over.id)
        const newArray = arrayMove(items, oldIndex, newIndex)
        notifyChange(newArray)
        return newArray
      })
    }
  }

  const addTask = () => {
    const newTasks = [
      ...tasks,
      { id: generateId(), title: '', description: '', frequency: '' },
    ]
    setTasks(newTasks)
    notifyChange(newTasks)
  }

  const updateTask = (id: string, updates: Partial<ChecklistTask>) => {
    const newTasks = tasks.map((t) => (t.id === id ? { ...t, ...updates } : t))
    setTasks(newTasks)
    notifyChange(newTasks)
  }

  const deleteTask = (id: string) => {
    const newTasks = tasks.filter((t) => t.id !== id)
    setTasks(newTasks)
    notifyChange(newTasks)
  }

  return (
    <div className="flex flex-col gap-4 border rounded-md p-4 bg-muted/10">
      <div className="flex justify-between items-start gap-4">
        <p className="text-sm text-muted-foreground">
          Definí las tareas recomendadas para el mantenimiento preventivo. Podés reordenarlas
          arrastrándolas.
        </p>
        <Button type="button" onClick={addTask} variant="secondary" size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Agregar Tarea
        </Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {tasks.map((task) => (
              <SortableTask
                key={task.id}
                task={task}
                onUpdate={updateTask}
                onDelete={deleteTask}
              />
            ))}
            {tasks.length === 0 && (
              <div className="text-center p-8 border border-dashed rounded-md text-muted-foreground">
                No hay tareas configuradas. Hacé clic en "Agregar Tarea" para comenzar.
              </div>
            )}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}
