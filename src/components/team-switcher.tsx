"use client"

import * as React from "react"

import {
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export function TeamSwitcher({
  teams,
}: {
  teams: {
    name: string
    logo: React.ElementType
    plan: string
  }[]
}) {
  if (!teams[0]) {
    return null
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem />
    </SidebarMenu>
  )
}
