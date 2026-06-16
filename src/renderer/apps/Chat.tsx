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

    // Slash commands — handled locally, no LLM call. We append the user's
    // text to the transcript (so it reads naturally), then a synthesized
    // assistant ack so the user sees confirmation. Unknown slash commands
    // fall through to the normal LLM path, in case the user wanted to ask
    // about a slash literally.
    const cmd = handleSlashCommand(trimmed)
    if (cmd) {
      const userMsg: ChatMessage = {
        id: nanoid(),
        role: 'user',
        content: trimmed,
        ts: new Date().toISOString()
      }
      const ackMsg: ChatMessage = {
        id: nanoid(),
        role: 'assistant',
        content: cmd.ack,
        ts: new Date().toISOString()
      }
      setMessages([...messages, userMsg, ackMsg])
      void cmd.run()
      return
    }

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
      <Header
        onClose={close}
        onCopyAll={() =>
          messages
            .map((m) => `${m.role === 'assistant' ? 'Clawd' : 'You'}: ${m.content}`)
            .join('\n\n')
        }
      />
      {carryFwd.length > 0 ? (
        <CarryForwardPrompt todos={carryFwd} onResolve={resolveCarryForward} />
      ) : (
        view
      )}
      {carryFwd.length === 0 && <InputBar disabled={streaming} onSend={(t) => send(t)} />}
    </motion.div>
  )
}

/**
 * Slash command resolver. Returns null if the input is not a known slash
 * command (the caller should pass through to the LLM normally). Returns
 * { ack, run } otherwise: `ack` is the text rendered as Clawd's response
 * in the transcript; `run` performs the side-effect (open window, fire
 * event, etc).
 *
 * Commands intentionally do NOT call the LLM — they're meant to be free
 * shortcuts so users can keep their hands on the keyboard.
 */
function handleSlashCommand(input: string): { ack: string; run: () => void | Promise<void> } | null {
  const m = input.match(/^\/(\w[\w-]*)\s*(.*)$/)
  if (!m) return null
  const [, name, args] = m
  const arg = (args ?? '').trim()
  switch (name.toLowerCase()) {
    case 'todo':
    case 'todos':
      return {
        ack: 'Opening your todo list…',
        run: () => window.api.todoWindow.open()
      }
    case 'tools':
    case 'companion':
    case 'about':
      return {
        ack: 'Opening the Companion window — it lists every tool, mode, and shortcut.',
        run: () => window.api.companionWindow.open()
      }
    case 'pomodoro':
    case 'pomo':
    case 'focus':
      return {
        ack: 'Opening the Pomodoro timer.',
        run: () => window.api.pomodoroWindow.open()
      }
    case 'pet':
      return {
        ack: '🌸 nice.',
        run: async () => {
          await window.api.petting.register()
        }
      }
    case 'snack':
    case 'feed':
      return {
        ack: 'nom nom nom… 🥬',
        run: async () => {
          await window.api.snack.give()
        }
      }
    case 'fetch':
    case 'play':
      return {
        ack: 'Throwing the ball! Clawd will romp for 60 seconds.',
        run: async () => {
          await window.api.avatar.funFetch()
        }
      }
    case 'fun':
      return {
        ack: 'Fun mode toggled. Click Clawd to stop.',
        run: async () => {
          await window.api.avatar.funToggle()
        }
      }
    case 'settings':
    case 'preferences':
      return {
        ack: 'Opening Settings.',
        run: () => window.api.settingsWindow.open()
      }
    case 'costume':
    case 'outfit': {
      const allowed = new Set(['none', 'santa', 'shades', 'party', 'witch'])
      if (allowed.has(arg)) {
        return {
          ack: `Costume → ${arg}.`,
          run: async () => {
            await window.api.settings.update({ costume: arg as 'none' | 'santa' | 'shades' | 'party' | 'witch' })
          }
        }
      }
      return {
        ack: 'Pick one of: none, santa, shades, party, witch. Try `/costume party`.',
        run: () => undefined
      }
    }
    case 'help':
    case 'commands':
    case '?':
      return {
        ack: [
          'Available commands:',
          '  /todo      — open the todo list',
          '  /tools     — open Companion (what Clawd can do)',
          '  /pomodoro  — open the focus timer',
          '  /pet       — pet Clawd',
          '  /snack     — give Clawd a snack',
          '  /fetch     — play fetch (60s)',
          '  /fun       — toggle fun mode',
          '  /costume X — change costume (none, santa, shades, party, witch)',
          '  /settings  — open Settings',
          '  /quit      — quit Pocket Clawd'
        ].join('\n'),
        run: () => undefined
      }
    case 'quit':
    case 'exit':
      return {
        ack: 'See you soon. 🌸',
        run: () => window.api.app.quit()
      }
    default:
      return null
  }
}
