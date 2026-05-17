"use client"

import * as React from "react"
import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible"

import { renderFromAsChild } from "@/components/ui/render"

function Collapsible({
  asChild,
  children,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root> & {
  asChild?: boolean
}) {
  return (
    <CollapsiblePrimitive.Root
      data-slot="collapsible"
      render={renderFromAsChild(asChild, children)}
      {...props}
    >
      {asChild ? undefined : children}
    </CollapsiblePrimitive.Root>
  )
}

function CollapsibleTrigger({
  asChild,
  children,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Trigger> & {
  asChild?: boolean
}) {
  return (
    <CollapsiblePrimitive.Trigger
      data-slot="collapsible-trigger"
      render={renderFromAsChild(asChild, children)}
      {...props}
    >
      {asChild ? undefined : children}
    </CollapsiblePrimitive.Trigger>
  )
}

function CollapsibleContent({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Panel>) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-content"
      {...props}
    />
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
