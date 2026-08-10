/**
 * Ber om fullskjerm ved første trykk, så Safari/Chrome-kappen forsvinner
 * idet spillet faktisk begynner — ikke idet siden laster, det ville blitt
 * avvist uten en brukerhandling å henge seg på.
 *
 * iPhone Safari har ingen Fullscreen API for vilkårlige elementer (bare for
 * <video>), så der feiler kallet stille — den eneste veien til fullskjerm
 * der er "Legg til på Hjemskjerm", som apple-mobile-web-app-capable i
 * index.html dekker. iPad, Android og desktop får ekte fullskjerm herfra.
 */

import { useEffect } from 'react'

type PrefixedFullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => void
}

export function useFullscreenOnFirstTouch() {
  useEffect(() => {
    function requestFullscreen() {
      if (document.fullscreenElement) return
      const el = document.documentElement as PrefixedFullscreenElement
      const request = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el)
      try {
        Promise.resolve(request?.()).catch(() => {})
      } catch {
        // Typisk iPhone Safari — ingen elementfullskjerm der.
      }
    }

    document.addEventListener('pointerdown', requestFullscreen, { once: true })
    return () => document.removeEventListener('pointerdown', requestFullscreen)
  }, [])
}
