import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { MessageSquare, Loader2, Send, User } from 'lucide-react'
import { workTaskService, type WorkTaskComment } from '@/services/work-task.service'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import { parseApiDate } from '@/lib/utils'
import { usePermissions } from '@/hooks/use-permissions'

interface Props {
  taskId: string
}

export function WorkTaskComments({ taskId }: Props) {
  const { can } = usePermissions()
  const canComment = can('tasks:comment')
  const queryClient = useQueryClient()
  const [text, setText] = useState('')

  const { data: comments, isLoading } = useQuery({
    queryKey: ['work-task-comments', taskId],
    queryFn: () => workTaskService.getComments(taskId),
  })

  const addMutation = useMutation({
    mutationFn: (commentText: string) => workTaskService.addComment(taskId, commentText),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-task-comments', taskId] })
      setText('')
      toast.success('Comentario agregado')
    },
    onError: () => toast.error('Error al agregar el comentario'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return
    addMutation.mutate(trimmed)
  }

  const sortedComments = comments ? [...comments].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) : []

  return (
    <div className="flex flex-col gap-4">
      <ScrollArea className="h-[260px]">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : sortedComments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
            <MessageSquare className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">Aún no hay comentarios.</p>
          </div>
        ) : (
          <div className="space-y-4 pr-3">
            {sortedComments.map((comment: WorkTaskComment) => (
              <div key={comment.id} className="rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <User className="h-4 w-4 text-muted-foreground" />
                    {comment.createdByName ?? 'Usuario'}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {format(parseApiDate(comment.createdAt), 'dd MMM yyyy HH:mm', { locale: es })}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{comment.text}</p>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {canComment && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <Textarea
            rows={3}
            placeholder="Agregar un comentario..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={addMutation.isPending}
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={!text.trim() || addMutation.isPending}>
              {addMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Comentar
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
