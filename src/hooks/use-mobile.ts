import * as React from "react"

const MOBILE_BREAKPOINT = 768

/** Live result of a media query; `serverValue` is used for the server render and hydration. */
export function useMediaQuery(query: string, serverValue = false) {
  return React.useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    () => window.matchMedia(query).matches,
    () => serverValue
  )
}

export function useIsMobile() {
  return useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
}
