'use client'

import { Menu } from 'lucide-react'
import { useState } from 'react'
import { Logo } from '@/components/brand/logo'
import { ThemeToggle } from '@/components/shell/theme-toggle'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet'

export function ShellFrame({
  logoHref,
  renderSidebar,
  children,
}: {
  logoHref: string
  renderSidebar: (onNavigate?: () => void) => React.ReactNode
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="min-h-dvh bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r bg-sidebar lg:block">
        {renderSidebar()}
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </Button>
          <Logo href={logoHref} />
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-8 lg:py-12">{children}</main>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[19rem] max-w-[85vw] gap-0 bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Browse organizations, projects and console pages.
          </SheetDescription>
          {renderSidebar(() => setOpen(false))}
        </SheetContent>
      </Sheet>
    </div>
  )
}
