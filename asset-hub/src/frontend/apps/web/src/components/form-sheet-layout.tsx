import type { FormEventHandler, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Apply to SheetContent for scrollable forms with a fixed footer. */
export const formSheetContentClass =
  'flex flex-col p-0 h-full gap-0 overflow-hidden'

const formClass = 'flex flex-col flex-1 min-h-0 overflow-hidden'
const bodyClass = 'flex-1 min-h-0 overflow-y-auto'
const footerClass = 'shrink-0 border-t bg-background p-6 flex justify-end gap-2'

type FormSheetLayoutProps = {
  header: ReactNode
  footer: ReactNode
  children: ReactNode
  onSubmit: FormEventHandler<HTMLFormElement>
  bodyClassName?: string
  formClassName?: string
}

export function FormSheetLayout({
  header,
  footer,
  children,
  onSubmit,
  bodyClassName,
  formClassName,
}: FormSheetLayoutProps) {
  return (
    <form onSubmit={onSubmit} className={cn(formClass, formClassName)}>
      <div className="shrink-0 border-b">{header}</div>
      <div className={cn(bodyClass, 'px-6 py-6', bodyClassName)}>{children}</div>
      <div className={footerClass}>{footer}</div>
    </form>
  )
}
