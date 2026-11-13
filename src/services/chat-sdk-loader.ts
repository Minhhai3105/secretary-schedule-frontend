type ChatSdk = typeof import('./backend-chat.ts')

export function createChatSdkLoader(importSdk: () => Promise<ChatSdk> = () => import('./backend-chat.ts')) {
  let sdkPromise: Promise<ChatSdk> | undefined
  return () => {
    sdkPromise ??= importSdk().catch(cause => {
      // A failed chunk load must not permanently block later user-initiated attempts.
      sdkPromise = undefined
      throw cause
    })
    return sdkPromise
  }
}

// One lazy loader shared by streaming and nonstreaming calls; no JWT is cached here.
export const loadChatSdk = createChatSdkLoader()
