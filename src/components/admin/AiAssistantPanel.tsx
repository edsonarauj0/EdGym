import { useState, useEffect, useRef } from 'react'
import { ChatSession } from '@google/generative-ai'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { createEdGymChatSession, sendMessage, EdGymContext, EdGymChatSession } from '@/lib/gemini'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  X,
  Send,
  Bot,
  User,
  Loader2,
  Sparkles,
  RefreshCw,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { FunctionDeclaration, SchemaType } from '@google/generative-ai'


interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

const QUICK_PROMPTS = [
  { emoji: '💪', label: 'Programa para iniciantes', prompt: 'Sugira um programa completo de treino para iniciantes com os aparelhos que temos disponíveis. Inclua grupos A e B com frequência 3x por semana.' },
  { emoji: '🏋️', label: 'Grupos A/B/C hipertrofia', prompt: 'Crie grupos de treino A, B e C focados em hipertrofia muscular, usando os aparelhos disponíveis na academia. Explique a divisão muscular de cada grupo.' },
  { emoji: '📅', label: 'Frequência ideal', prompt: 'Qual a frequência de treino ideal para cada objetivo: emagrecimento, hipertrofia e condicionamento? Como devo distribuir os grupos de treino na semana?' },
  { emoji: '🔄', label: 'Exercícios alternativos', prompt: 'Com base nos aparelhos que temos, quais exercícios posso usar como alternativa para treinar peito, costas, pernas e ombros?' },
  { emoji: '⚡', label: 'Treino rápido 45min', prompt: 'Monte um treino completo que possa ser feito em 45 minutos usando os aparelhos disponíveis. Ideal para alunos com pouco tempo.' },
]

interface AiAssistantPanelProps {
  isOpen: boolean
  onClose: () => void
}

const createWorkoutGroupDeclaration: FunctionDeclaration = {
  name: 'createWorkoutGroup',
  description: 'Cria um grupo de treino no sistema com seus exercícios',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      name: { type: SchemaType.STRING, description: 'Nome do grupo, ex: "Grupo A - Empurrar"' },
      focus: { type: SchemaType.STRING, description: 'Foco muscular do grupo' },
      exercises: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            name: { type: SchemaType.STRING },
            sets: { type: SchemaType.NUMBER },
            reps: { type: SchemaType.STRING },
            equipment: { type: SchemaType.STRING },
          },
          required: ['name', 'sets', 'reps'],
        },
      },
    },
    required: ['name', 'focus', 'exercises'],
  },
}
export function AiAssistantPanel({ isOpen, onClose }: AiAssistantPanelProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingContext, setIsLoadingContext] = useState(true)
  const [session, setSession] = useState<EdGymChatSession | null>(null)  
  const [edGymContext, setEdGymContext] = useState<EdGymContext | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isOpen && !session) {
      initSession()
    }
  }, [isOpen])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (isOpen) inputRef.current?.focus()
  }, [isOpen])

  async function initSession() {
    setIsLoadingContext(true)
    try {
      // Carrega contexto da academia do Firestore
      const [equipSnap, groupsSnap, usersSnap] = await Promise.all([
        getDocs(collection(db, 'equipment')),
        getDocs(collection(db, 'workoutGroups')),
        getDocs(collection(db, 'users')),
      ])

      const ctx: EdGymContext = {
        equipmentList: equipSnap.docs.map(d => d.data().name as string).filter(Boolean),
        workoutGroups: groupsSnap.docs.map(d => d.data().name as string).filter(Boolean),
        totalUsers: usersSnap.size,
      }

      setEdGymContext(ctx)
      const newSession = createEdGymChatSession(ctx)
      setSession(newSession)

      // Mensagem de boas-vindas
      setMessages([{
        role: 'assistant',
        content: `Olá! Sou seu assistente de personal training. 💪\n\nTenho acesso ao contexto atual da academia:\n- **${ctx.equipmentList.length}** aparelhos cadastrados\n- **${ctx.workoutGroups.length}** grupos de treino\n- **${ctx.totalUsers}** alunos\n\nComo posso ajudar você a planejar os treinos hoje?`,
        timestamp: new Date(),
      }])
    } catch (err) {
      console.error('[AI] Erro ao carregar contexto:', err)
    } finally {
      setIsLoadingContext(false)
    }
  }

  async function handleSend(text?: string) {
    const messageText = text || input.trim()
    if (!messageText || isLoading || !session) return

    setInput('')
    const userMsg: Message = { role: 'user', content: messageText, timestamp: new Date() }
    setMessages(prev => [...prev, userMsg])
    setIsLoading(true)

    try {
      const response = await sendMessage(session, messageText)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      }])
    } catch (err: any) {
      const message = String(err?.message ?? '').toLowerCase()
      const isQuotaError = message.includes('429') || message.includes('quota') || message.includes('rate limit')
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: isQuotaError
          ? '❌ O limite de uso da API Gemini foi atingido. Aguarde alguns instantes e tente novamente; se o problema persistir, aumente a cota ou o plano no Google AI Studio.'
          : '❌ Não foi possível processar sua pergunta agora. A IA pode estar temporariamente indisponível; tente novamente em alguns instantes.',
        timestamp: new Date(),
      }])
    } finally {
      setIsLoading(false)
    }
  }

  function handleReset() {
    setMessages([])
    setSession(null)
    initSession()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-[420px] bg-card border-l border-border z-50 flex flex-col shadow-2xl transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-gradient-to-r from-primary/10 to-purple-500/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center shadow-lg shadow-primary/20">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-semibold text-sm">Personal Trainer IA</p>
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                <p className="text-xs text-muted-foreground">Powered by Gemini</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handleReset} title="Nova conversa">
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Context badges */}
        {edGymContext && (
          <div className="flex gap-2 px-4 py-2 border-b border-border/50 bg-secondary/20 flex-wrap">
            <Badge variant="secondary" className="text-xs">
              🏋️ {edGymContext.equipmentList.length} aparelhos
            </Badge>
            <Badge variant="secondary" className="text-xs">
              📋 {edGymContext.workoutGroups.length} grupos
            </Badge>
            <Badge variant="secondary" className="text-xs">
              👥 {edGymContext.totalUsers} alunos
            </Badge>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoadingContext ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm">Carregando contexto da academia...</p>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  {/* Avatar */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    msg.role === 'assistant'
                      ? 'bg-gradient-to-br from-primary to-purple-500'
                      : 'bg-secondary'
                  }`}>
                    {msg.role === 'assistant'
                      ? <Bot className="w-4 h-4 text-white" />
                      : <User className="w-4 h-4" />
                    }
                  </div>

                  {/* Bubble */}
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                    msg.role === 'assistant'
                      ? 'bg-secondary/60 rounded-tl-sm'
                      : 'bg-primary text-primary-foreground rounded-tr-sm'
                  }`}>
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p>{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {isLoading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="bg-secondary/60 rounded-2xl rounded-tl-sm px-4 py-3">
                    <div className="flex gap-1 items-center h-4">
                      <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce [animation-delay:0ms]" />
                      <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce [animation-delay:150ms]" />
                      <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Quick prompts */}
        {messages.length <= 1 && !isLoadingContext && (
          <div className="px-4 pb-3">
            <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Sugestões rápidas
            </p>
            <div className="flex flex-wrap gap-2">
              {QUICK_PROMPTS.map((qp) => (
                <button
                  key={qp.label}
                  onClick={() => handleSend(qp.prompt)}
                  disabled={isLoading || isLoadingContext}
                  className="text-xs px-3 py-1.5 rounded-full border border-border/60 bg-secondary/40 hover:bg-secondary hover:border-primary/40 transition-all disabled:opacity-50"
                >
                  {qp.emoji} {qp.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="p-4 border-t border-border">
          <div className="flex gap-2 items-end bg-secondary/40 rounded-2xl border border-border/60 focus-within:border-primary/50 focus-within:bg-secondary/60 transition-all px-4 py-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pergunte sobre exercícios, grupos, frequência..."
              className="flex-1 bg-transparent text-sm resize-none outline-none max-h-32 min-h-[20px] placeholder:text-muted-foreground"
              rows={1}
              disabled={isLoading || isLoadingContext}
              style={{ height: 'auto' }}
              onInput={e => {
                const t = e.target as HTMLTextAreaElement
                t.style.height = 'auto'
                t.style.height = Math.min(t.scrollHeight, 128) + 'px'
              }}
            />
            <Button
              size="icon"
              className="w-8 h-8 rounded-xl shrink-0"
              onClick={() => handleSend()}
              disabled={!input.trim() || isLoading || isLoadingContext}
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Enter para enviar · Shift+Enter para nova linha
          </p>
        </div>
      </div>
    </>
  )
}
