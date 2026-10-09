/** Only gameplay focus can turn keyboard input into direction intents. */
export function isGameplayFocus(target: EventTarget | null, canvas: EventTarget, body: EventTarget): boolean {
  return target === canvas || target === body
}
