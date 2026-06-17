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
      return {
        ack: 'Throwing the ball! Clawd will romp for 60 seconds.',
        run: async () => {
          await window.api.avatar.funFetch()
        }
      }
    case 'play':
      // /play is continuous (no auto-stop) — same as /fun. Use /fetch
      // for the 60-second ball-throw session. (Previously /play was
      // aliased to /fetch and stopped after a minute, which surprised
      // people.) Click Clawd to stop.
      return {
        ack: 'Play mode! Click Clawd to stop.',
        run: async () => {
          // Only toggle ON; if it's already on, leave it on.
          const s = await window.api.avatar.funToggle()
          // funToggle returns the new active state — if the call flipped
          // it OFF, flip back ON so /play is idempotent (always ends in
          // play mode). One extra IPC round-trip in the rare case is fine.
          if (!s) await window.api.avatar.funToggle()
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
    case '8ball':
    case '8b': {
      const ANSWERS = [
        'It is certain.', 'Without a doubt.', 'Yes — definitely.', 'You may rely on it.',
        'As I see it, yes.', 'Most likely.', 'Outlook good.', 'Signs point to yes.',
        'Reply hazy, try again.', 'Ask again later.', 'Better not tell you now.', 'Cannot predict now.',
        "Don't count on it.", 'My reply is no.', 'My sources say no.', 'Outlook not so good.', 'Very doubtful.'
      ]
      const a = ANSWERS[Math.floor(Math.random() * ANSWERS.length)] ?? 'Hmm.'
      return {
        ack: arg ? `🎱 ${a}` : 'Ask me a yes/no question after /8ball.',
        run: () => undefined
      }
    }
    case 'dance':
      return {
        ack: 'dancing!',
        run: () => {
          // Main owns the dance session — animation + sound loop are
          // driven from AVATAR_DANCE_STATE in the avatar renderer.
          void window.api.avatar.dance()
        }
      }
    case 'me':
    case 'journal':
      if (!arg) {
        return { ack: 'Type something after /me to journal it.', run: () => undefined }
      }
      return {
        ack: 'saved to your journal.',
        run: async () => {
          await window.api.journal.append(arg)
        }
      }
    case 'mute':
    case 'unmute':
      return {
        ack: 'Toggled sound effects.',
        run: async () => {
          const s = await window.api.settings.get()
          await window.api.settings.update({ mute: !s.mute })
        }
      }
    case 'tickle':
      return {
        ack: 'tickling!',
        run: async () => {
          await window.api.avatar.tickle()
        }
      }
    case 'chess': {
      // /chess              — open the board
      // /chess e4           — open & make the move
      // /chess vs           — toggle vs-Clawd
      // /chess reset|new    — start a fresh game
      if (!arg) {
        return {
          ack: 'Opening the chess board.',
          run: () => window.api.chess.open()
        }
      }
      const lower = arg.toLowerCase()
      if (lower === 'vs' || lower === 'ai' || lower === 'clawd') {
        return {
          ack: 'Toggled vs-Clawd.',
          run: async () => {
            const s = await window.api.chess.getState()
            await window.api.chess.setVsAi(!s.vsAi, 'b')
            await window.api.chess.open()
          }
        }
      }
      if (lower === 'reset' || lower === 'new') {
        return {
          ack: 'Fresh board.',
          run: async () => {
            await window.api.chess.reset()
            await window.api.chess.open()
          }
        }
      }
      // Otherwise treat the arg as a SAN move.
      return {
        ack: `${arg}…`,
        run: async () => {
          await window.api.chess.open()
          const res = await window.api.chess.move(arg)
          if (!res.ok) {
            // Surface the error inline; keeps the chat helpful when the
            // move was rejected.
            // (We can't push another assistant message here without
            // restructuring; the whisper system handles in-game feedback.)
          }
        }
      }
    }
    case 'move': {
      if (!arg) {
        return { ack: 'Type a move after /move (e.g. /move e4).', run: () => undefined }
      }
      return {
        ack: `${arg}…`,
        run: async () => {
          await window.api.chess.move(arg)
        }
      }
    }
    case 'puzzle': {
      return {
        ack: 'Loading the daily puzzle.',
        run: async () => {
          await window.api.chess.open()
          await window.api.chess.puzzleGet()
        }
      }
    }
    case 'openings':
    case 'opening': {
      const slug = arg.toLowerCase().split(/\s+/)[0]
      if (!slug) {
        return {
          ack: 'Try /openings sicilian (or italian, qgd).',
          run: () => undefined
        }
      }
      return {
        ack: `Starting drill: ${slug}.`,
        run: async () => {
          const r = await window.api.chess.openingStart(slug)
          if (!r.ok && r.error) {
            // Phase A: chessOpenings stub returns an error string.
          }
        }
      }
    }
    case 'help':
    case 'commands':
    case '?':
      return {
        ack: [
          'Available commands:',
          '  /todo       — open the todo list',
          '  /tools      — open Companion (what Clawd can do)',
          '  /pomodoro   — open the focus timer',
          '  /pet        — pet Clawd',
          '  /snack      — give Clawd a snack',
          '  /fetch      — play fetch (60s, ball overlay)',
          '  /play       — continuous play (click Clawd to stop)',
          '  /fun        — toggle fun mode',
          '  /costume X  — change costume (none, santa, shades, party, witch)',
          '  /settings   — open Settings',
          '  /8ball <q>  — magic 8-ball answer',
          '  /dance      — Clawd dances for 8s',
          '  /me <text>  — write a journal entry to memory',
          '  /mute       — toggle sound effects',
          '  /tickle     — tickle Clawd',
          '  /chess [m]  — open the board (or play a move, /chess vs, /chess reset)',
          '  /move <m>   — play a move on the current board (e.g. /move Nf3)',
          '  /puzzle     — open the daily puzzle',
          '  /openings X — opening drill (sicilian, italian, qgd)',
          '  /quit       — quit Pocket Clawd'
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
