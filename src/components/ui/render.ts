import * as React from "react"

export function renderFromAsChild(
  asChild: boolean | undefined,
  children: React.ReactNode
) {
  if (!asChild) return undefined
  return React.Children.only(children) as React.ReactElement
}
