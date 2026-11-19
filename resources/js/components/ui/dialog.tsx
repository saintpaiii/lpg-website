import * as DialogPrimitive from "@radix-ui/react-dialog"
import { XIcon } from "lucide-react"
import * as React from "react"

import { cn } from "@/lib/utils"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/80",
        className
      )}
      {...props}
    />
  )
}

/** The last plain `p-N` / `gap-N` utility in a className, in px (Tailwind: N × 4px). */
function spacingPx(className: string | undefined, prop: "p" | "gap", fallback: number): number {
  const all = [...(className ?? "").matchAll(new RegExp(`(?:^|\\s)${prop}-(\\d+(?:\\.5)?)(?=\\s|$)`, "g"))]
  return all.length ? Number(all[all.length - 1][1]) * 4 : fallback
}

/** Where the X sits: always INSIDE the dialog box, this far from its top and right edges (px). */
const CLOSE_INSET = 12

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { showCloseButton?: boolean }) {
  // K6: the close row lives inside the padding box, so the X is offset by the dialog's own padding — the same
  // corner for the default p-6 dialogs and the p-0 ones (scrolling body + sticky footer), never sticking out.
  const pad = spacingPx(className, "p", 24)
  const gap = spacingPx(className, "gap", 16)
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          // Never taller than the screen: the content scrolls inside (max-h-[90dvh] overflow-y-auto) — and never
          // wider than the box (overflow-x-hidden): wide tables scroll in their own container.
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 flex max-h-[90dvh] w-full max-w-[calc(100%-1rem)] translate-x-[-50%] translate-y-[-50%] flex-col gap-4 overflow-y-auto overflow-x-hidden rounded-lg border p-4 shadow-lg duration-200 sm:max-w-lg sm:p-6 max-sm:max-w-[calc(100%-1rem)]",
          className
        )}
        {...props}
      >
        {children}
        {/* Close button: a zero-height sticky row shown first (order-first) but last in the DOM, so it stays in the
            corner while the content scrolls and the first form field still gets the focus when the dialog opens.
            The row sticks at the content edge (sticky offsets count from inside the padding); the X is pulled back
            by the padding to CLOSE_INSET from the box edges. */}
        {showCloseButton && (
          <div data-slot="dialog-close-row" className="pointer-events-none sticky top-0 z-10 order-first h-0 shrink-0 self-stretch"
            style={{ marginBottom: -gap }}>
            <DialogPrimitive.Close data-slot="dialog-close"
              style={{ top: CLOSE_INSET - pad, right: CLOSE_INSET - pad }}
              className="ring-offset-background focus:ring-ring data-[state=open]:text-muted-foreground bg-background/90 pointer-events-auto absolute rounded-xs p-1 opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
              <XIcon />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      // The title never runs under the X: pr-8 inside a padded dialog; pr-10 for edge-to-edge headers (px-6 in a p-0
      // dialog — the X is 12px + 24px from the box edge). A pr-* in className still wins.
      className={cn("flex flex-col gap-2 text-center sm:text-left", className,
        !/(^|\s)pr-/.test(className ?? "") && (/(^|\s)px-/.test(className ?? "") ? "pr-10" : "pr-8"))}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        // On phones the footer sticks to the bottom of a long dialog — CSS in app.css ([data-slot=dialog-footer]), applied
        // only when the dialog keeps its default padding (a dialog with its own p-0 layout styles its own footer)
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
