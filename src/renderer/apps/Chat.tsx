/**
 * Chat panel — streaming UI, header drag, opening question, "done" handling.
 * On mount fetches `pendingCarryForward` from the todo store and asks the
 * user whether to roll those over (per the project's "ask each morning" choice).
 */
import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import type { ChatMessage, Todo } from '@shared/types'
import { Header } from '../components/Header'
import { Message } from '../components/Message'
import { InputBar } from '../components/InputBar'
import { CarryForwardPrompt } from '../components/CarryForwardPrompt'
import { stripSpec } from '../lib/stripSpec'

export function ChatApp(): JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const [streamBuf, setStreamBuf] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [specPath, setSpecPath] = useState<string | null>(null)
  const [carryFwd, setCarryFwd] = useState<Todo[]>([])
  const scrollerRef = useRef<HTMLDivElement>(null)

  // Initial: pending carry-forward + opening question
  useEffect(() => {
    void window.api.todos.pendingCarryForward().then((pending) => {
      if (pending.length > 0) {
        setCarryFwd(pending)
      } else {
        sendOpening()
      }
    })

    const off = window.api.chat.onStream((ev) => {
      switch (ev.type) {
        case 'delta':
          setStreamBuf((b) => b + ev.text)
          break
        case 'done':
          setStreamBuf('')
          setStreaming(false)
          setMessages((m) => [
            ...m,
            {
              id: nanoid(),
              role: 'assistant',
              content: stripSpec(ev.full),
              ts: new Date().toISOString()
            }
          ])
          if (ev.specReady) setSpecPath(ev.specReady.filePath)
          break
        case 'error':
          setError(ev.message)
          setStreaming(false)
          setStreamBuf('')
          break
      }
    })
    return off
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-scroll on new content
  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight
    }
  }, [messages, streamBuf])

  /**
   * Kick off the opening turn. We send a single user "Hi." that's recorded
   * as a real visible message — earlier we tried to hide it, but that left
   * the conversation history starting with an assistant turn, which is
   * malformed and rejected by stricter Anthropic-compatible providers.
   */
  function sendOpening(): void {
    void send('Hi')
  }

  async function send(text: string): Promise<void> {
    const trimmed = text.trim()
    if (!trimmed || streaming) return
    setError(null)
    void window.api.app.registerActivity()

    const userMsg: ChatMessage = {
      id: nanoid(),
      role: 'user',
      content: trimmed,
      ts: new Date().toISOString()
    }
    const next = [...messages, userMsg]
    setMessages(next)

    setStreaming(true)
    setStreamBuf('')
    try {
      const result = await window.api.chat.send(next)
      // Belt-and-suspenders: if main rejected without firing an error event,
      // make sure the streaming flag doesn't stay stuck. The error event
      // path covers chatBusy and most cases, but this is the safety net.
      if (result && result.ok === false) {
        setStreaming(false)
      }
    } catch (err) {
      setError((err as Error).message)
      setStreaming(false)
    }
  }

  async function resolveCarryForward(keepIds: string[]): Promise<void> {
    await window.api.todos.resolveCarryForward(keepIds)
    setCarryFwd([])
    sendOpening()
  }

  function close(): void {
    void window.api.chat.close()
  }

  const view = useMemo(() => {
    return (
      <div ref={scrollerRef} className="flex-1 overflow-y-auto scrollbar px-4 py-3 space-y-2">
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <Message key={m.id} role={m.role}>
              {m.content}
            </Message>
          ))}
          {streaming && streamBuf && (
            <Message key="streaming" role="assistant" streaming>
              {stripSpec(streamBuf)}
            </Message>
          )}
        </AnimatePresence>
        {error && (
          <div className="text-red-400 text-xs px-3 py-2 bg-red-900/20 rounded">
            {error}
          </div>
        )}
        {specPath && (
          <div className="text-success text-xs px-3 py-2 bg-success/10 rounded border border-success/30">
            Session saved → {specPath}
          </div>
        )}
      </div>
    )
  }, [messages, streamBuf, streaming, error, specPath])

  return (
    <motion.div
      className="w-screen h-screen flex flex-col bg-bg/95 backdrop-blur-md text-textMain rounded-2xl overflow-hidden border border-white/5 shadow-2xl"
      initial={{ scale: 0.85, opacity: 0, originX: 1, originY: 1 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
    >
      <Header onClose={close} />
      {carryFwd.length > 0 ? (
        <CarryForwardPrompt todos={carryFwd} onResolve={resolveCarryForward} />
      ) : (
        view
      )}
      {carryFwd.length === 0 && <InputBar disabled={streaming} onSend={(t) => send(t)} />}
    </motion.div>
  )
}
