"use client"

import * as React from "react"
import { ImageIcon, SquareTerminal } from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { Sidebar, SidebarContent } from "@/components/ui/sidebar"

// This is sample data.
const data = {
  navMain: [
    {
      title: "Posts",
      url: "/cms/posts",
      icon: SquareTerminal,
    },
    {
      title: "Images",
      url: "/cms/images",
      icon: ImageIcon,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
    </Sidebar>
  )
}
