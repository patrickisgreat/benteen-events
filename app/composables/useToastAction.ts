/** Runs an async action, returning true on success or — if it throws — logging
 *  the error, toasting `errorTitle`, and returning false. The caller decides what
 *  success looks like (the success toast varies per call site). */
export function useToastAction() {
  const toast = useToast()

  async function run(action: () => Promise<void>, errorTitle: string): Promise<boolean> {
    try {
      await action()
      return true
    } catch (e) {
      console.error('[useToastAction]', e)
      toast.add({ title: errorTitle, color: 'error' })
      return false
    }
  }

  return { run }
}
