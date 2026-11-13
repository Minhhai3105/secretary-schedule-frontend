import assert from 'node:assert/strict'
import test from 'node:test'
import { createChatSdkLoader } from '../src/services/chat-sdk-loader.ts'

type ChatSdk = typeof import('../src/services/backend-chat.ts')

test('SDK loader stays lazy and shares pending and completed loads', async () => {
  const gate = Promise.withResolvers<ChatSdk>()
  const sdk = {} as ChatSdk // Module identity is sufficient; this test does not call SDK methods.
  let imports = 0
  const load = createChatSdkLoader(() => { imports++; return gate.promise })
  assert.equal(imports, 0)
  const first = load()
  const concurrent = load()
  assert.equal(imports, 1)
  assert.strictEqual(first, concurrent)
  gate.resolve(sdk)
  assert.strictEqual(await first, sdk)
  assert.strictEqual(load(), first)
  assert.equal(imports, 1)
})

test('a rejected SDK load is cleared so a later user attempt can load again', async () => {
  const sdk = {} as ChatSdk
  const failure = new Error('Temporary module download failure')
  let imports = 0
  const load = createChatSdkLoader(() => ++imports === 1 ? Promise.reject(failure) : Promise.resolve(sdk))
  await assert.rejects(load(), error => error === failure)
  assert.strictEqual(await load(), sdk)
  assert.equal(imports, 2)
})
